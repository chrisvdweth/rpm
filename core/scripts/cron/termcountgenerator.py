import sys
import json
import requests
import numpy as np

import pymysql.cursors
import pymysql
import datetime
import yaml

import pandas as pd
import spacy


class TermCountGenerator:

    with open("config.yaml", 'r') as ymlfile:
        config = yaml.safe_load(ymlfile)

    BASE_URL__SOLR = config['url']['solr']

    MYSQL_HOST = config['database']['mysql']['host']
    MYSQL_USER = config['database']['mysql']['user']
    MYSQL_PWD = config['database']['mysql']['password']
    MYSQL_DBNAME = config['database']['mysql']['dbname']

    API_URL__PROTECTED = config['url']['api_server']

    API_ENDPOINT__POST_TOPWORDS = 'newsarticles/topwords/daily/'

    def __init__(self):
        self.db = pymysql.connect(host=TermCountGenerator.MYSQL_HOST,
                                  user=TermCountGenerator.MYSQL_USER,
                                  password=TermCountGenerator.MYSQL_PASSWORD,
                                  db=TermCountGenerator.MYSQL_DB,
                                  charset='utf8mb4',
                                  cursorclass=pymysql.cursors.DictCursor)
        self.nlp = spacy.load('en')


    def get_document_solr(self, article_id):
        try:
            r = requests.get("{}/rpm_news/select?q=id:{}&wt=json".format(TermCountGenerator.BASE_URL__SOLR, article_id))
            return r.json()['response']['docs'][0]
        except Exception as e:
            print("[get_document_solr]")

            print(article_id)
            print(e)
            return None

    def get_documents(self, id_list):
        documents = []
        for doc_id in id_list:
            doc = self.get_document_solr(doc_id)
            if doc is not None:
                documents.append(doc)
        return documents


    def get_ids_for_batch(self, day, source, category):
        try:
            id_list = []
            with self.db.cursor() as cursor:
                sql = "SELECT a.id FROM rpm_news_articles a, rpm_pages_categories_grr c WHERE a.id = c.url_id AND DATE(a.published_at)=TIMESTAMP('{}') AND a.source={} AND c.category={}".format(day, source, category)
                cursor.execute(sql)
                for row in cursor.fetchall():
                    id_list.append(row['id'])
            return id_list
        except Exception as e:
            print("[get_ids_for_batch]")
            print(e)
            return None


    def generate_batch_document(self, documents, remove_stopwords=True, title_weight=2, valid_pos_tags=None):
        word_list = []
        for d in documents:
            document = "{} {}".format((d['title'] + ". ")*title_weight, d['content'])
            doc = self.nlp(document)
            for token in doc:
                if valid_pos_tags is not None and token.pos_ not in valid_pos_tags:
                    continue
                if remove_stopwords is True and token.is_stop == True:
                    continue
                word_list.append(token.text.lower())
        return word_list


    def generate_word_count_dict(self, word_list, limit=200):
        word_count_dict = {}
        for word, count in pd.Series(word_list).value_counts().head(limit).iteritems():
            word_count_dict[word] = count
        return word_count_dict


    def submit_top_words(self, date, source, category, word_counts):
        try:
            data = {"published_at": date, "source": source, "category": category, "data": word_counts }
            r = requests.post('{}{}'.format(TermCountGenerator.API_URL__PROTECTED, TermCountGenerator.API_ENDPOINT__POST_TOPWORDS), json=data)
            response = json.loads(r.text)
        except Exception as e:
            print("[submit_top_words]" + str(e))


    def get_sources(self, min_doc_count=1000):
        try:
            source_id_list = []
            with self.db.cursor() as cursor:
                sql = "SELECT source FROM rpm_news_articles GROUP BY source HAVING COUNT(*) >= {} AND source > 0".format(min_doc_count)
                cursor.execute(sql)
                for row in cursor.fetchall():
                    source_id_list.append(row['source'])
            return source_id_list
        except Exception as e:
            print(e)
            return None

    def generate_dates(self, start_date, end_date):
        return [ (start_date + datetime.timedelta(n)).strftime('%Y-%m-%d') for n in range(int ((end_date - start_date).days))]


    def run(self, start_date, end_date):
        start_time = datetime.datetime.now()
        dates_list = self.generate_dates(start_date, end_date)
        sources_list = self.get_sources()

        for date in dates_list:
            # for source in ['1136264918', '2318860610', '4035711312', '2027664695', '971732516 ']:
            for source in sources_list:
                # for category in range(1,9):
                for category in range(1, 6):  # for GRR support
                    id_list = self.get_ids_for_batch(date, source, category)
                    batch_documents = self.get_documents(id_list)
                    word_list = self.generate_batch_document(batch_documents, valid_pos_tags=['NOUN', 'PROPN'])
                    word_counts = self.generate_word_count_dict(word_list)
                    if len(word_counts) == 0:
                        continue
                    #print(date, source, category, word_counts)
                    self.submit_top_words(date, source, category, word_counts)

            time_elapsed = datetime.datetime.now() - start_time
            print("{} [{}]".format(date, time_elapsed))


    def generate_start_end_dates(self, start_date_str=None, end_date_str=None):
        if start_date_str is None:
            start_date = datetime.datetime.today()
            start_date = start_date - datetime.timedelta(days=1)
        else:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d')

        if end_date_str is None:
            end_date = datetime.datetime.today()
        else:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d')

        return start_date, end_date



if __name__ == '__main__':

    term_count_generator = TermCountGenerator()

    if len(sys.argv) == 1:
        start_date, end_date = term_count_generator.generate_start_end_dates()
    elif len(sys.argv) == 3:
        start_date, end_date = term_count_generator.generate_start_end_dates(start_date_str=sys.argv[1], end_date_str=sys.argv[2])
    else:
        print("Usage: python termcountgenerator.py <start-date-str> <end-date-str>")
        exit(0)

    term_count_generator.run(start_date, end_date)
