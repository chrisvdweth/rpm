import string

from spacy.en import English
from sklearn.feature_extraction.stop_words import ENGLISH_STOP_WORDS
from nltk.corpus import stopwords
from nltk.corpus import wordnet as wn


nlp = English()


class NlpUtil:
    # A custom stoplist
    STOP_WORD_SET = set(stopwords.words('english') + ["n't", "'s", "'m", "ca"] + list(ENGLISH_STOP_WORDS))
    # List of symbols we don't care about
    SYMBOLS = " ".join(string.punctuation).split(" ") + ["-----", "---", "...", "“", "”", "'ve"]

    @staticmethod
    def generate_doc(text):
        doc = nlp(text)
        return nlp(text)


    @staticmethod
    def get_named_entities(doc, distinct=True, ignore_case=True):
        seen = set()
        named_entities = []
        for ent in doc.ents:
            if ignore_case:
                ent_text = ent.text.lower()
            else:
                ent_text = ent.text
            if not distinct:
                named_entities.append({'text': ent_text, 'label': ent.label_, 'start_char': ent.start_char, 'end_char': ent.end_char, 'cnt': 1})
            else:
                if ent_text not in seen:
                    named_entities.append({'text': ent_text, 'label': ent.label_, 'start_char': ent.start_char, 'end_char': ent.end_char, 'cnt': 1})
                    seen.add(ent_text)
                else:
                    item = next(item for item in named_entities if item["text"] == ent_text)
                    item['cnt'] += 1

        return named_entities

    @staticmethod
    def get_noun_chunks(doc):
        noun_chunks = []
        for chunk in doc.noun_chunks:
            noun_chunks.append({'text': chunk.text, 'start_char': chunk.start_char, 'end_char': chunk.end_char, 'root_text': chunk.root.text})
            #print(chunk.text, chunk.root.text, chunk.root.dep_, chunk.root.head.text, chunk.start_char)
        return noun_chunks

    @staticmethod
    def get_hyponyms(word):
        synsets = wn.synsets(word)
        print(synsets)
        for synset in synsets:
            print("----------------------------")
            NlpUtil._get_hyponyms(synset)

    @staticmethod
    def _get_hyponyms(synset):
        hyponyms = set()
        for hyponym in synset.hyponyms():
            print(hyponym)
            hyponyms |= set(NlpUtil._get_hyponyms(hyponym))
        return hyponyms | set(synset.hyponyms())


    @staticmethod
    def get_hypernyms(word):
        synsets = wn.synsets(word)
        print(synsets)
        for synset in synsets:
            print("----------------------------")
            print(NlpUtil._get_hypernyms(synset))

    @staticmethod
    def _get_hypernyms(synset):
        hypernyms = set()
        for hypernym in synset.hypernyms():
            print(hypernym)
            hypernyms |= set(NlpUtil._get_hypernyms(hypernym))
        return hypernyms | set(synset.hypernyms())

    @staticmethod
    def remove_stop_tokens(doc, stop_set_list):
        s = set()
        for stop_set in stop_set_list:
            s = s.union(set(stop_set))
        return [t for t in doc if t.text.lower() not in s]

    @staticmethod
    def remove_stop_words(word_list, stop_set_list):
        s = set()
        for stop_set in stop_set_list:
            s = s.union(set(stop_set))
        return [t for t in word_list if t.text.lower() not in s]



if __name__ == '__main__':

    text = "The latest weather patterns show that there is a hurricane approaching Bali."

    #doc = NlpUtil.generate_doc(text)

    #print(NlpUtil.get_noun_chunks(doc))

    print(NlpUtil.get_hypernyms("blast"))