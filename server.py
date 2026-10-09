import json
import mimetypes
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
HOST = '127.0.0.1'
PORT = 8000

def etapa(status='NA', mensagem='Sem fonte integrada para validar esta etapa.'):
    return {'status': status, 'mensagem': mensagem}


def etapas_demo(**sobreposicoes):
    etapas = {
        'vpn': etapa(),
        'ssh_wocc51': etapa(),
        'ssh_destino': etapa(),
        'arquivo_original': etapa(),
        'descriptografia': etapa(),
        'distribuicao_wocc': etapa(),
        'mis': etapa(),
        'cmk': etapa(),
    }
    etapas.update(sobreposicoes)
    return etapas


# Cenários ilustrativos, não representam leituras nem conexões do ambiente real.
CARTEIRAS = [
    {
        'id': 'SANTANDER',
        'nome': 'Santander',
        'principal': True,
        'demonstracao': True,
        'frequencia': 'Diária',
        'arquivo_esperado': 'Arquivo criptografado (padrão/nome não configurado)',
        'ambiente': {'wocc': 'WOCC51 → WOCC61', 'departamento': 'Não configurado', 'diretorio': 'Não configurado'},
        'etapas': etapas_demo(
            vpn=etapa('OK', 'Exemplo: túnel VPN disponível.'),
            ssh_wocc51=etapa('OK', 'Exemplo: WOCC51 acessível via SSH.'),
            ssh_destino=etapa('NA', 'Host/VM de destino ainda não configurado.'),
            arquivo_original=etapa('ATENCAO', 'Exemplo: aguardando chegada do arquivo criptografado diário.'),
            descriptografia=etapa('NA', 'Aguardando arquivo original.'),
            distribuicao_wocc=etapa('NA', 'VM e diretório local de destino não configurados.'),
            mis=etapa('NA', 'Destino MIS não configurado.'),
            cmk=etapa('NA', 'Destino CMK não configurado.')
        )
    },
    {
        'id': 'CREFISA', 'nome': 'Crefisa', 'demonstracao': True,
        'frequencia': 'Não informada',
        'ambiente': {'wocc': 'WOCC61', 'departamento': 'Não configurado', 'diretorio': 'Não configurado'},
        'etapas': etapas_demo(vpn=etapa('OK', 'Exemplo de cenário: VPN disponível.'))
    },
    {
        'id': 'DMCARD', 'nome': 'dmcard', 'demonstracao': True,
        'frequencia': 'Não informada',
        'ambiente': {'wocc': 'WOCC61', 'departamento': 'Não configurado', 'diretorio': 'Não configurado'},
        'etapas': etapas_demo(ssh_wocc51=etapa('ATENCAO', 'Exemplo de cenário: acesso SSH requer validação.'))
    },
    {
        'id': 'RENNER', 'nome': 'Renner', 'demonstracao': True,
        'frequencia': 'Não informada',
        'ambiente': {'wocc': 'WOCC61', 'departamento': 'Não configurado', 'diretorio': 'Não configurado'},
        'etapas': etapas_demo(arquivo_original=etapa('NA', 'Padrão de arquivo e janela de recebimento não configurados.'))
    },
    {
        'id': 'CREDZM', 'nome': 'Credzm', 'demonstracao': True,
        'frequencia': 'Não informada',
        'ambiente': {'wocc': 'WOCC61', 'departamento': 'Não configurado', 'diretorio': 'Não configurado'},
        'etapas': etapas_demo(descriptografia=etapa('ERRO', 'Exemplo de cenário: falha simulada na descriptografia.'))
    },
    {
        'id': 'CARREFOUR', 'nome': 'Carrefour', 'demonstracao': True,
        'frequencia': 'Não informada',
        'ambiente': {'wocc': 'WOCC61', 'departamento': 'Não configurado', 'diretorio': 'Não configurado'},
        'etapas': etapas_demo(
            distribuicao_wocc=etapa('OK', 'Exemplo de cenário: cópia local concluída.'),
            mis=etapa('ATENCAO', 'Exemplo de cenário: entrega MIS pendente de confirmação.'),
            cmk=etapa('ERRO', 'Exemplo de cenário: entrega CMK falhou.')
        )
    },
]


def calcular_status_geral(etapas):
    valores = [etapa.get('status', 'NA') for etapa in etapas.values()]
    if 'ERRO' in valores:
        return 'ERRO'
    if 'ATENCAO' in valores:
        return 'ATENCAO'
    if not valores or 'NA' in valores:
        return 'NA'
    return 'OK'


def montar_payload():
    dados = []
    for item in CARTEIRAS:
        carteira = dict(item)
        carteira['etapas'] = {
            chave: dict(detalhe) for chave, detalhe in item['etapas'].items()
        }
        carteira['arquivo_monitorado'] = dict(item.get('arquivo_monitorado', {
            'janela_esperada': None,
            'prazo_em': None,
            'nome_arquivo': None,
            'recebido_em': None,
        }))
        carteira['historico_execucoes'] = list(item.get('historico_execucoes', []))
        carteira['status_geral'] = calcular_status_geral(carteira['etapas'])
        dados.append(carteira)
    return {
        'empresa': 'Winover',
        'topologia': {
            'fluxos': [
                {
                    'rotulo': 'CARGA PRINCIPAL',
                    'origem': 'Santander · arquivo diário criptografado',
                    'nos': [
                        {'nome': 'WOCC51', 'detalhe': 'Recebe a carga Santander'},
                        {'nome': 'WOCC61', 'detalhe': 'Recebe a carga encaminhada pela WOCC51'},
                        {'nome': 'VMs / departamentos', 'detalhe': 'Destinos locais por carteira · mapeamento pendente'},
                    ],
                },
                {
                    'rotulo': 'DEMAIS CARTEIRAS',
                    'origem': 'Crefisa · dmcard · Renner · Credzm · Carrefour',
                    'nos': [
                        {'nome': 'WOCC61', 'detalhe': 'Recebe as demais cargas'},
                        {'nome': 'VMs / departamentos', 'detalhe': 'Destinos locais por carteira · mapeamento pendente'},
                    ],
                },
            ],
        },
        'horario_consulta': time.strftime('%d/%m/%Y %H:%M:%S'),
        'total_carteiras': len(dados),
        'modo_demonstracao': True,
        'fonte': 'Cenários locais demonstrativos; nenhuma conexão operacional é executada.',
        'carteiras': dados,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/status-geral':
            self.send_json(200, montar_payload())
            return

        if path in ('/', '/index.html'):
            self.serve_file('index.html')
            return

        if path.startswith('/styles.css'):
            self.serve_file('styles.css')
            return

        if path.startswith('/script.js'):
            self.serve_file('script.js')
            return

        self.send_error(404, 'Arquivo não encontrado.')

    def serve_file(self, filename):
        file_path = os.path.join(ROOT_DIR, filename)
        if not os.path.isfile(file_path):
            self.send_error(404, 'Arquivo não encontrado.')
            return

        content_type, _ = mimetypes.guess_type(file_path)
        if content_type is None:
            content_type = 'application/octet-stream'
        elif content_type.startswith('text/') or content_type in ('application/javascript', 'application/json', 'application/xml'):
            content_type = f'{content_type}; charset=utf-8'

        with open(file_path, 'rb') as arquivo:
            dados = arquivo.read()

        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(dados)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(dados)

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'Servidor NOC rodando em http://{HOST}:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nEncerrando servidor...')
    finally:
        server.server_close()
