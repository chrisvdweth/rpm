'''
NewsArticleSocialSignalUpdater

Use the public Facebook API to collect the social signals for all news articles in database.
The API takes as parameter a list of 50 urls, so each everything is processed in batches of 50.


Affect database tables:
* INSERT/UPDATE
 - rpm_pages_social_signals
 
'''


import facebook
import requests
import json
import sys
import urllib.parse

import pymysql.cursors
import pymysql
import yaml

from datetime import date, timedelta, datetime
from time import sleep


class NewsArticleSocialSignalUpdater:

    with open("config.yaml", 'r') as ymlfile:
        config = yaml.safe_load(ymlfile)

    FB_APP_ID = config['channel']['facebook']['app_id']
    FB_APP_SECRET = config['channel']['facebook']['app_secret']

    MYSQL_HOST = config['database']['mysql']['host']
    MYSQL_USER = config['database']['mysql']['user']
    MYSQL_PWD = config['database']['mysql']['password']
    MYSQL_DBNAME = config['database']['mysql']['dbname']

    ACCESS_TOKEN = config['script']['nassupdater']['access_token']

    SERVER_IP = config['url']['api_server']

    URL_MAX_AGE_IN_DAYS = 10

    FB_API_ERR__UNKNOWN = 1001
    FB_API_ERR__REQUEST_LIMIT_REACHED = 1002
    FB_API_ERR__ACCESS_TOKEN_ISSUE = 1003


    def __init__(self):
        self.graph = facebook.GraphAPI()
        self.db = pymysql.connect(host=NewsArticleSocialSignalUpdater.MYSQL_HOST,
                                  user=NewsArticleSocialSignalUpdater.MYSQL_USER,
                                  passwd=NewsArticleSocialSignalUpdater.MYSQL_PWD,
                                  database=NewsArticleSocialSignalUpdater.MYSQL_DBNAME,
                                  autocommit=True)

        self.access_token = NewsArticleSocialSignalUpdater.ACCESS_TOKEN

    def get_engagement(self, url):

        try:
            response = requests.get('https://graph.facebook.com/?id={}&fields=engagement&access_token={}'.format(url, self.access_token))
            response_json = json.loads(response.text)
            x_app_usage = json.loads(response.headers['x-app-usage'])
            if 'error' in response_json:
                if 'limit' in response_json['error']['message']:
                    return None, x_app_usage, NewsArticleSocialSignalUpdater.FB_API_ERR__REQUEST_LIMIT_REACHED
                elif 'token' in response_json['error']['message']:
                    return None, x_app_usage, NewsArticleSocialSignalUpdater.FB_API_ERR__ACCESS_TOKEN_ISSUE
                else:
                    return None, x_app_usage, NewsArticleSocialSignalUpdater.FB_API_ERR__UNKNOWN
            else:
                engagement = None
                if 'engagement' in  response_json:
                    engagement = response_json['engagement']
                return engagement, x_app_usage, 0
        except Exception as e:
            print(e)
            return None, None, NewsArticleSocialSignalUpdater.FB_API_ERR__UNKNOWN


    def get_share_count(self, url):
        try:
            response = requests.get('https://graph.facebook.com/?fields=share&id={}'.format(url))
            x_app_usage = json.loads(response.headers['x-app-usage'])
            share_count = json.loads(response.text)['share']['share_count']
            return share_count, x_app_usage
        except Exception as e:
            print(e)
            return None, None

    def get_share_data(self, url_list):
        try:
            urls_string = ','.join(map(str, url_list))
            urls_string = urllib.parse.quote(urls_string)
            response = requests.get("https://graph.facebook.com/v2.2/?ids={}&access_token={}&fields=engagement".format(urls_string, self.access_token))
            x_app_usage = json.loads(response.headers['x-app-usage'])
            response_json = json.loads(response.text)
            return response_json, x_app_usage, 0
        except Exception as e:
            print(e)
            return None, None, NewsArticleSocialSignalUpdater.FB_API_ERR__UNKNOWN



    def set_updated_at(self, url_ids_list, date_str):
        if len(url_ids_list) == 0:
            return
        id_str_line = ','.join(["'{}'".format(id_str) for id_str in url_ids_list])
        query = "UPDATE rpm_news_articles SET updated_at = STR_TO_DATE('{}','%Y-%m-%d %H:%i:%s') WHERE id IN ({})".format(date_str, id_str_line)
        with self.db.cursor() as cursor:
            cursor.execute(query)


    def set_flag(self, url_ids_list, value):
        if len(url_ids_list) == 0:
            return
        id_str_line = ','.join([ "'{}'".format(id_str) for id_str in url_ids_list])
        query = "UPDATE rpm_news_articles SET flag = {} WHERE id IN ({})".format(value, id_str_line)
        with self.db.cursor() as cursor:
            cursor.execute(query)


    def get_next_article_batch(self, min_date_str, limit=50):
        batch = []
        query = "SELECT id, url, published_at FROM rpm_news_articles WHERE valid = 1 AND MOD(GREATEST(valid, flag), 3) <> 0 AND published_at >= STR_TO_DATE('{}', '%Y-%m-%dT%TZ') ORDER BY updated_at ASC LIMIT {}".format(min_date_str, limit)
        with self.db.cursor() as cursor:
            cursor.execute(query)
            while True:
                row = cursor.fetchone()
                if row is None:
                    break
                batch.append((row[0], row[1].lower(), row[2]))

        return batch


    def post_social_signals(self, url_id_str, share_count, comment_count, reaction_count):
        try:
            if share_count > 0:
                r = requests.post(NewsArticleSocialSignalUpdater.server_ip +'/pages/socialsignals/', json={"signal_source": 200, "signal_type": 203, "signal_value": share_count, "url_id": url_id_str})
            if reaction_count > 0:
                r = requests.post(NewsArticleSocialSignalUpdater.server_ip + '/pages/socialsignals/', json={"signal_source": 200, "signal_type": 202, "signal_value": reaction_count, "url_id": url_id_str})
            if comment_count > 0:
                r = requests.post(NewsArticleSocialSignalUpdater.server_ip + '/pages/socialsignals/', json={"signal_source": 200, "signal_type": 201, "signal_value": comment_count, "url_id": url_id_str})
            return True
        except Exception as e:
            print("[Error] NewsArticleSocialSignalUpdater.post_social_signals:", e)
            return False


    def process_batch(self, min_date_str):
        batch = self.get_next_article_batch(min_date_str)

        x_app_usage = {}

        if len(batch) == 0:
            return True, x_app_usage

        url_ids_list = [ str(tup[0]) for tup in batch ]
        url_list = [ str(tup[1]) for tup in batch ]

        _, _, last_published_at = batch[-1]

        response, x_app_usage, error = self.get_share_data(url_list)
        response = {k.lower(): v for k, v in response.items()}

        if error == NewsArticleSocialSignalUpdater.FB_API_ERR__REQUEST_LIMIT_REACHED:
            print("Application request limit reached: {}".format(str(x_app_usage)))
            return True, x_app_usage, last_published_at

        if error == NewsArticleSocialSignalUpdater.FB_API_ERR__ACCESS_TOKEN_ISSUE:
            print("Access token issue: {}".format(self.access_token))
            self.access_token = self.graph.get_app_access_token(NewsArticleSocialSignalUpdater.FB_APP_ID, NewsArticleSocialSignalUpdater.FB_APP_SECRET)
            print("New access token: {}".format(self.access_token))
            return False, x_app_usage, last_published_at

        if error == NewsArticleSocialSignalUpdater.FB_API_ERR__UNKNOWN:
            print("Unknown error")
            return True, x_app_usage, last_published_at

        for idx in range(len(url_list)):
            url = url_list[idx]
            url_id = url_ids_list[idx]

            try:
                engagement = response[url]['engagement']
                self.post_social_signals(url_ids_list[idx], engagement['share_count'], engagement['comment_count'], engagement['reaction_count'])
            except Exception as e:
                print(e)

        today = datetime.now()
        expired_url_ids_list = [ str(id_str) for id_str, url, published_at in batch if (today - published_at).days > NewsArticleSocialSignalUpdater.URL_MAX_AGE_IN_DAYS ]

        self.set_flag(expired_url_ids_list, 3)
        self.set_updated_at(url_ids_list, (today+timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'))

        return False, x_app_usage, last_published_at


    def process(self, min_date_str):
        sys.stdout.write('Start fetching social signals for news articles ({})\n'.format(min_date_str))
        sys.stdout.flush()
        done = False
        while not done:
            sys.stdout.write('Processing batch...')
            sys.stdout.flush()
            done, x_app_usage, last_published_at = self.process_batch(min_date_str)
            sys.stdout.write('DONE ({}, {})\n'.format(str(x_app_usage), str(last_published_at)))
            sys.stdout.flush()
            sleep(20)




if  __name__ == '__main__':

    nass_updater = NewsArticleSocialSignalUpdater()

    url = 'https://www.nytimes.com/2018/08/21/nyregion/michael-cohen-plea-deal-trump.html'
    url_2 = 'http://www.channelnewsasia.com/news/business/volkswagen--misused--me--accused-executive-tells-judge-9464732'
    print(nass_updater.get_engagement(url))
    print(nass_updater.get_share_count(url))
    print(len(nass_updater.get_next_article_batch('2018-03-01')))

    if len(sys.argv) < 2:
        print("Usage: python nassupdater.py <min-date-str>")
        exit(0)

    min_date_str = sys.argv[1]
    print(min_date_str)
    nass_updater.process(min_date_str)


## But the number shown is the sum of:
#
#  - number of likes of this URL
#  - number of shares of this URL (this includes copy/pasting a link back to Facebook)
#  - number of likes and comments on stories on Facebook about this URL
#  - number of inbox messages containing this URL as an attachment.
