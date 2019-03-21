'''
NewsArticleFeeder

This script collects all new news article data (raw data from MongoDB collection)
and stores it into the RPM MySQL database for further processing

Steps that are performed in the backend:
* Check if valid news article data item
* Check if article already exists (if yes, stop)
* Update word frequencies table
* Add article to Solr

Affect database tables:
* INSERT
 - rpm_news_articles
 - rpm_pages_categories
 - rpm_news_articles_document_frequencies
* UPDATE
 - rpm_parameters

'''


import sys
import json
import requests
import yaml

from pymongo import MongoClient
from bson import ObjectId


class NewsArticleFeeder:

    with open("config.yaml", 'r') as ymlfile:
        config = yaml.safe_load(ymlfile)

    MONGODB_HOST = config['database']['mongodb']['host']
    MONGODB_NAME = config['database']['mongodb']['name']
    API_URL__PROTECTED = config['url']['api_server']

    API_ENDPOINT__GET_PARAMETER = '/parameters/'
    API_ENDPOINT__SET_PARAMETER = '/parameters/'
    API_ENDPOINT__INSERT_NEWS_ARTICLE = '/newsarticles/'
    API_ENDPOINT__PAGES_CATEGORIES = '/pages/categories/'

    PARAM_NAME__LATEST_FED_NEWS_ARTICLE_OID = 'latest_fed_news_article_oid'

    DOMAIN_MAPPING = {
        'not_applicable': 0,
        'health': 1,
        'safety_security': 2,
        'environment': 3,
        'social_relations': 4,
        'meaning_in_life': 5,
        'achievement': 6,
        'economics': 7,
        'politics': 8
    }


    def __init__(self):
        self.mongodb_client = MongoClient(host=NewsArticleFeeder.MONGODB_HOST)
        self.mongodb_name = self.mongodb_client[NewsArticleFeeder.MONGODB_NAME]

    def get_latest_oid(self):
        try:
            r = requests.get('{}{}'.format(NewsArticleFeeder.API_URL__PROTECTED, NewsArticleFeeder.API_ENDPOINT__GET_PARAMETER), params={'name': NewsArticleFeeder.PARAM_NAME__LATEST_FED_NEWS_ARTICLE_OID})
            response = json.loads(r.text)
            return response['value']
        except Exception as e:
            print(e)
            return None

    def set_latest_oid(self, oid):
        payload = {"name": NewsArticleFeeder.PARAM_NAME__LATEST_FED_NEWS_ARTICLE_OID, "value": str(oid) }
        try:
            r = requests.post('{}{}'.format(NewsArticleFeeder.API_URL__PROTECTED, NewsArticleFeeder.API_ENDPOINT__SET_PARAMETER), json=payload)
            response = json.loads(r.text)
            if ('msg' in response):
                if response['msg'] == 'success':
                    return True
            return False
        except Exception as e:
            print(e)
            return False

    def fetch_batch(self, collection_name, limit=100):
        min_oid = self.get_latest_oid()

        if min_oid is None or min_oid == 0 or min_oid == '0':
            query = { "$and": [ { "labels" : { "$exists": True } } ] }
        else:
            query = { "$and": [ { "labels" : { "$exists": True } }, { '_id': {'$gt': ObjectId(min_oid)} } ] }

        collection = self.mongodb_name[collection_name]

        latest_oid = None

        cnt = 0
        for doc in collection.find(query).limit(limit):
            latest_oid = doc['_id']
            title = doc['title']
            text = doc['text']
            url = doc['url']
            labels = doc['labels']
            summary = doc['summary']

            top_image_url = ''
            try:
                top_image_url = doc['top_image']
            except:
                pass

            try:
                published = doc['published']
                published_at = published.isoformat()
            except:
                continue

            if ',' in title:
                title = ' '.join(title.split(',')[0:-1])

            article = {"published_at": published_at, "title": title, "url": url, "img_url": top_image_url, "content": text, "valid": 1}

            label_list = []
            if len(labels) == 0:
                label_list.append("0")
            else:
                for l in labels:
                    label_list.append("{}".format(NewsArticleFeeder.DOMAIN_MAPPING[l]))

            try:
                r = requests.post('{}{}'.format(NewsArticleFeeder.API_URL__PROTECTED, NewsArticleFeeder.API_ENDPOINT__INSERT_NEWS_ARTICLE), json=article)
                r = requests.post('{}{}'.format(NewsArticleFeeder.API_URL__PROTECTED, NewsArticleFeeder.API_ENDPOINT__PAGES_CATEGORIES), json={"url": url, "categories": ",".join(label_list)})
            except Exception as e:
                print("[ERROR] NewsArticleFeeder.fetch_batch:", e)
            cnt += 1

        if latest_oid is not None:
            self.set_latest_oid(latest_oid)

        if cnt > 0:
            return False
        else:
            return True

    def fetch(self, collection_name, limit=1000):
        sys.stdout.write('Start fetching news articles\n')
        sys.stdout.flush()
        done = False
        cnt = 0
        while not done:
            cnt += 1
            sys.stdout.write('Processing batch...')
            sys.stdout.flush()
            done = self.fetch_batch(collection_name, limit=limit)
            sys.stdout.write('DONE ({:,})\n'.format(limit*cnt))
            sys.stdout.flush()

if __name__ == '__main__':

    news_article_feeder = NewsArticleFeeder()

    news_article_feeder.fetch('categorized_news')
