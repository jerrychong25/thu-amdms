import re
import string
import numpy as np
import tensorflow as tf
from tensorflow.python.keras.models import model_from_json
from joblib import load
import json

# Remove All Urls With HTTP and HTTPS Function
def remove_url_with_http_https(text):
    url = re.compile(r'https?://\S+|www\.\S+')
    return url.sub(r'', text)

# Remove All Urls Without HTTP and HTTPS Function
def remove_url_without_http_https(text):
    url = re.compile(r'(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}')
    return url.sub(r'', text)

# Remove All Emojis Function
def remove_emoji(text):
    emoji_pattern = re.compile(
        '['
        u'\U0001F600-\U0001F64F'  # Emoticons
        u'\U0001F300-\U0001F5FF'  # Symbols & Pictographs
        u'\U0001F680-\U0001F6FF'  # Transport & Map Symbols
        u'\U0001F1E0-\U0001F1FF'  # Flags (iOS)
        u'\U00002702-\U000027B0'
        u'\U000024C2-\U0001F251'
        ']+',
        flags=re.UNICODE)
    return emoji_pattern.sub(r'', text)

# Remove All HTMLs Tags Function
def remove_html(text):
    html = re.compile(r'<.*?>|&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-f]{1,6});')
    return re.sub(html, '', text)

# Remove All Punctuations Function
def remove_punct(text):
    table = str.maketrans('', '', string.punctuation)
    return text.translate(table)
class TweeterClassifier:
    """Classification class that loads the saved Tensorflow 2.0 model and weights
       and classifies the disaster related  tweets.
    """

    def __init__(self, model_dir):
        # Load Pre-Processing
        self.MAX_TWEET_LENGTH = 100
        self.MIN_PREDICTION_SCORE = 0.95
        self.tokenizer = load(f'{model_dir}/tokenizer.joblib')
        self.tokenizer = load(f'{model_dir}/tokenizer.joblib')
        self.label_encoder = load(f'{model_dir}/labelencoder.joblib')
        
        # Load Model
        with open(f'{model_dir}/model.json', 'r') as model_json_file:
            model_json_file_data = json.load(model_json_file)
        self.model = model_from_json(json.dumps(model_json_file_data))
        self.model.load_weights(f'{model_dir}/model-weights.h5')
        
        print("Loaded model from disk")
        
        # Evaluate Loaded Model
        self.model.compile(loss='categorical_crossentropy', optimizer='adam', metrics=['accuracy'])

    def predict(self, tweet):
        tweet = self._sanitize(tweet)
        
        x = [tweet]
        x_seq = self.tokenizer.texts_to_sequences(x)[0]
        x_pad = tf.keras.preprocessing.sequence.pad_sequences([x_seq], maxlen=self.MAX_TWEET_LENGTH, padding='post')[0]
        x_pad = np.array(x_pad)
        x_pad = x_pad.reshape(1, self.MAX_TWEET_LENGTH)

        # Multi-Class classification
        prediction_class = np.argmax(self.model.predict(x_pad), axis=1)
        prediction_score = max(self.model.predict(x_pad)[0])
        
        prediction_category = self.label_encoder.inverse_transform(prediction_class)[0]
        
        print("predict - prediction_category: ")
        print(prediction_category)

        return {
            'category': prediction_category,
            'score': str(prediction_score),
            'tweet': tweet
        }

    def _sanitize(self, tweet):            
        # Run All Above Functions For Cleaning Data
        tweet = remove_url_with_http_https(tweet)
        tweet = remove_url_without_http_https(tweet)
        tweet = remove_emoji(tweet)
        tweet = remove_html(tweet)
        tweet = remove_punct(tweet)
        tweet = tweet.strip()
        tweet = tweet.lower()
        
        return tweet
