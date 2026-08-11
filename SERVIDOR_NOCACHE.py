import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
PORT = 8150
with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
    print('Servidor SIN CACHE en http://127.0.0.1:%d  (los temas siempre cargan frescos)' % PORT)
    httpd.serve_forever()
