import os
import sys
import json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from llm_provider.models import LLM
from parser import parser

apikey = os.getenv("GEMINI_API_KEY")
if not apikey:
    raise RuntimeError("Set the GEMINI_API_KEY environment variable before running this script.")

model = LLM(provider="gemini", api_key=apikey, model="gemini-3.5-flash-lite")

my_parser = parser(model)
input_1 = """

Hey!

My name is Likka I'm 21 years old I'm from Arunachal Pradesh but currently I live in Agartala Tripura. I'm a student of b.pharm…if I talk about my family I'm the youngest one I have 6 brothers and 3 sisters 😊 yeah I'm rich in siblings…I belong to a middle-class family background.

I feel lucky that I was born into a middle-class family because of that today I know the value of money..and if I talk about my hobbies I love reading, Journaling, spending time with old people around 67-80 age cause I love to know about their life journey, I love learning new things, spending time with myself to know myself more, gardening, I love to watch UPSC aspirant vlogs because their vlogs motivate me a lot's….

If I talk about my relationship status I'm single I have never been in any relationship till now and I'm not ashamed of it…most people think that you're 20+ now and should at least make one, but frankly speaking, I hate that tag “#Ex” I don't want to be called by someone ex neither me want to call someone to be my ex….I believe in God plan's and I know that one day I will meet my prince charming when right the time comes ….till that time I want to focus and concentrate only on my studies and myself.

This is my first time writing in Quora…please do consider my mistakes ….


"""
output = my_parser.parse(existing_profile="{}", user_text=input_1)

with open("output.json", "w") as f:
    f.write(output)