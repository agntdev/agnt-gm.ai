"""Local checkout UI fixture; no Telegram API calls or real charges.
Run VITE_API_BASE=/api npm run build, then python3 scripts/checkout-preview.py.
Query ?result=cancelled|failed|pending|paid controls the fake Telegram callback.
"""
import http.server
import json
import pathlib
import time

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'dist'
paid_at = None
BRIDGE = """<script>window.Telegram={WebApp:{platform:'tdesktop',initData:'local-fixture',version:'8.0',ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},openInvoice(url,cb){const result=new URLSearchParams(location.search).get('result')||'paid';if(result==='paid')fetch('/fixture/pay',{method:'POST'}).then(()=>cb(result));else cb(result);}}};</script>"""

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *args): pass
    def send_json(self, obj):
        data=json.dumps(obj).encode(); self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers();self.wfile.write(data)
    def do_POST(self):
        global paid_at
        length=int(self.headers.get('Content-Length','0')); self.rfile.read(length)
        if self.path=='/fixture/pay': paid_at=time.monotonic(); return self.send_json({})
        if self.path.endswith('/auth/telegram'): return self.send_json({'token':'fixture'})
        if self.path.endswith('/deploy/invoice'): return self.send_json({'payment_required':True,'star_cost':100,'invoice_url':'https://t.me/$fixture'})
        return self.send_json({'ok':True})
    def do_GET(self):
        path=self.path.split('?')[0]
        paid=paid_at is not None and time.monotonic()-paid_at>2
        if path=='/':
            page=(ROOT/'index.html').read_text().replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>',BRIDGE)
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(page.encode());return
        if not path.startswith('/api/'):
            if path.startswith('/app/'): self.path=path[4:]
            return super().do_GET()
        if path.endswith('/deploy/payment'):return self.send_json({'payment_required':not paid,'star_cost':100,'paid':paid,'billing':'per_bot'})
        if path.endswith('/bot'):return self.send_json({'bot_username':'checkout_preview_bot','container_state':'running' if paid else 'none','paused':False})
        if path.endswith('/chat/messages'):return self.send_json({'messages':[{'id':1,'role':'assistant','content':'Your reminder bot is ready. Describe any improvement here.'}],'next_after':1})
        if path.endswith('/deployments'):return self.send_json({'deployments':[]})
        if '/projects/demo' in path:return self.send_json({'project':{'id':'demo','slug':'reminder','name':'Reminder bot','status':'live','current_phase':'published','bot_username':'checkout_preview_bot','bot_is_live':paid,'build_progress':{'stage':'live','percent':100}}})
        return self.send_json({})

print('Checkout fixture: http://127.0.0.1:5189/#/bots/demo',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',5189),Handler).serve_forever()
