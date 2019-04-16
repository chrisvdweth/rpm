import pymysql.cursors
import pymysql

from datetime import datetime, timedelta


class DailyUpdater:

    MYSQL_HOST = 'localhost'
    MYSQL_USER = 'root'
    MYSQL_PASSWORD = '!!5656tT'
    MYSQL_DBNAME = 'rpmdb'

    def __init__(self):
        self.db = pymysql.connect(host=DailyUpdater.MYSQL_HOST,
                                  user=DailyUpdater.MYSQL_USER,
                                  passwd=DailyUpdater.MYSQL_PASSWORD,
                                  database=DailyUpdater.MYSQL_DBNAME,
                                  autocommit=True)


    def run(self):
        self._update_news_article_counts()
        self._update_news_article_social_signals()
        self._update_news_article_rankings()


    def _update_news_article_counts(self):
        dates = self._create_dates()
        dates = [ "'{}'".format(d) for d in dates ]

        sql = "INSERT IGNORE INTO rpm_news_articles_count_daily \
               SELECT DATE(a.published_at) AS published_at, a.source, c.category, COUNT(*) AS article_count \
               FROM rpm_news_articles a, rpm_pages_categories c \
               WHERE a.id = c.url_id \
               AND DATE(a.published_at) IN ({}) \
               GROUP BY DATE(a.published_at), a.source, c.category".format(", ".join(dates))

        #print(sql)
        try:
            with self.db.cursor() as cursor:
                cursor.execute(sql)
        except Exception as e:
            print(e)



    def _update_news_article_social_signals(self):
        dates = self._create_dates(start_offset=12)
        dates = [ "'{}'".format(d) for d in dates ]

        sql = "DELETE FROM rpm_news_articles_social_signals_count_daily WHERE published_at IN ({})".format(", ".join(dates))
        #print(sql)
        try:
            with self.db.cursor() as cursor:
                cursor.execute(sql)
        except Exception as e:
            print(e)

        sql = "INSERT INTO rpm_news_articles_social_signals_count_daily \
               SELECT DATE(a.published_at) AS published_at, a.source AS article_source, c.category, s.signal_source AS signal_source, s.signal_type, SUM(s.signal_value) AS cnt \
               FROM rpm_news_articles a, rpm_pages_categories c, rpm_pages_social_signals s \
               WHERE a.id = s.url_id AND a.id = c.url_id AND s.url_id = c.url_id \
               AND s.signal_value > 0 \
               AND DATE(a.published_at) IN ({}) \
               GROUP BY a.source, DATE(a.published_at), c.category, s.signal_source, s.signal_type".format(", ".join(dates))
        #print(sql)
        try:
            with self.db.cursor() as cursor:
                cursor.execute(sql)
        except Exception as e:
            print(e)


    def _update_news_article_rankings(self):
        dates = self._create_dates(start_offset=12)
        dates = [ "'{}'".format(d) for d in dates ]

        sql = "DELETE FROM rpm_news_articles_ranking WHERE published_at IN ({})".format(", ".join(dates))
        #print(sql)
        try:
            with self.db.cursor() as cursor:
                cursor.execute(sql)
        except Exception as e:
            print(e)

        sql = "INSERT IGNORE INTO rpm_news_articles_ranking \
               SELECT DATE(a.published_at) as published_at, a.id, a.source AS article_source, c.category AS article_category, s.signal_source AS signal_source, s.signal_type AS signal_type, s.signal_value \
               FROM rpm_news_articles a, rpm_pages_categories c, rpm_pages_social_signals s \
               WHERE a.id = s.url_id AND a.id = c.url_id AND s.url_id = c.url_id AND \
               DATE(a.published_at) IN ({})".format(", ".join(dates))
        #print(sql)
        try:
            with self.db.cursor() as cursor:
                cursor.execute(sql)
        except Exception as e:
            print(e)



    def _create_dates(self, start_offset=2, end_offset=2):
        today = datetime.today()
        start_date = today - timedelta(days=start_offset)
        end_date = today + timedelta(days=end_offset)

        return [(start_date + timedelta(n)).strftime('%Y-%m-%d') for n in range(int((end_date - start_date).days))]






if __name__ == '__main__':

    daily_updater = DailyUpdater()

    daily_updater.run()