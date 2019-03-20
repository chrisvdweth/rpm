import re

from natty import DateParser


class TimeUtil:

    KEYWORDS_SET__WEEKDAYS = {'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'}
    KEYWORDS_SET__WEEKDAYS_SHORT = {'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'}

    TIME_PHRASE_MAPPING = {
        'day before yesterday': '2 days ago',
        'ereyesterday': '2 days ago',
        'overmorrow': 'in 2 days',
        'fortnight': '14 days',
        'early morning': 'morning',
        'earlier morning': 'morning',
        'late morning': 'morning',
        'later morning': 'morning',
        'early afternoon': 'afternoon',
        'earlier afternoon': 'afternoon',
        'late afternoon': 'afternoon',
        'later afternoon': 'afternoon',
        'early evening': 'evening',
        'earlier evening': 'evening',
        'late evening': 'evening',
        'later evening': 'evening',
        'early night': 'night',
        'earlier night': 'night',
        'late night': 'night',
        'later night': 'night',
        'dawn': 'morning',
        'sunrise': 'morning',
        'sunset': 'evening',
        'early hours': 'morning',
        'boxing day': '26 december',
        'at the moment': 'now',
        'at this moment': 'now',
        'at that moment': 'now',
        'at present': 'now',
        'for the time being': 'now'
    }




    @staticmethod
    def process(s, time_format_str=None):
        s = TimeUtil._preprocess_string(s)
        s = TimeUtil._handle_day(s)
        # Preprocess string by replacing some "non-standard" words and phrases into "standard" ones
        # (i.e., words or phrases that Natty handles out of the box)
        s = TimeUtil._multiple_replace(s)
        # Evaluate Natty over string
        time_struct_list = TimeUtil._process_natty(s)
        if time_struct_list is None:
            time_struct_list = []
        # Convert datetime object ot human-readable string if specified
        if time_format_str is not None:
            time_struct_list = [ time_struct.strftime(time_format_str) for time_struct in time_struct_list]
        return time_struct_list


    @staticmethod
    def _process_natty(s):
        dp = DateParser(s)
        return dp.result()


    @staticmethod
    def _handle_day(s):
        weekdays_str = '|'.join(TimeUtil.KEYWORDS_SET__WEEKDAYS.union(TimeUtil.KEYWORDS_SET__WEEKDAYS_SHORT))
        p, offset = re.compile(r"(^|\b[a-zA-Z]+\b )\b(%s)\b" %weekdays_str), 0
        for m in p.finditer(s):
            prec_word = s[m.start(1)+offset : m.end(1)+offset].strip()
            print(prec_word)
            if prec_word not in ['past', 'coming', 'next'] or prec_word in ['last', 'previous']:
                s = ' '.join(s[:m.end(1)+offset].split() + ['past'] + s[m.start(2)+offset:m.end(2)+offset].split() + s[m.end(2)+offset:].split())
                offset += len('past')+1 # +1 because of additional whitespace
        return s


    @staticmethod
    def _preprocess_string(s):
        s = s.lower()
        s = re.sub(r"(\b[0-9]*1)(st\b)", r"\1", s)
        s = re.sub(r"(\b[0-9]*2)(nd\b)", r"\1", s)
        s = re.sub(r"(\b[0-9]*3)(rd\b)", r"\1", s)
        s = re.sub(r"(\b[0-9]*[0-9])(th\b)", r"\1", s)
        s = re.sub(r"(\b[0-9]+)(d\b)", r"\1 days", s)           # "12d" => "12 days"
        s = re.sub(r"(\b[0-9]+)(h\b)", r"\1 hours", s)          # "12h" => "12 hours"
        s = re.sub(r"(\b[0-9]+)(m\b)", r"\1 minutes", s)        # "12m" => "12 minutes"
        s = re.sub(r"(\b[0-9]+)(s\b)", r"\1 seconds", s)        # "12s" => "12 seconds"
        s = re.sub(r"(\b[0-9]+)([a-zA-Z]+\b)", r"\1 \2", s)     # "12xxx" => "12 xxx"
        return s


    @staticmethod
    def _multiple_replace(s):
        # Create a regular expression  from the dictionary keys
        regex = re.compile("(\b%s\b)" % "|".join(map(re.escape, TimeUtil.TIME_PHRASE_MAPPING.keys())), re.IGNORECASE)
        # For each match, look-up corresponding value in dictionary
        return regex.sub(lambda mo: TimeUtil.TIME_PHRASE_MAPPING[mo.string[mo.start():mo.end()].lower()], s)


if __name__ == '__main__':

    s = "yesterday early hours"
    print(TimeUtil.process(s))