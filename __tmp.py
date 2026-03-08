import re, pathlib 
text=pathlib.Path(r'src/pages/messages/Messages.tsx').read_text() 
import itertools 
m=re.search(r'const sendMessage = async \(\) =,text) 
print(text[start:start+1500]) 
