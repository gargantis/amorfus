import socket, os, struct, hmac, hashlib, sys
MAGIC=0x2112A442
def attr(t, v):
    pad = (4 - len(v) % 4) % 4
    return struct.pack('!HH', t, len(v)) + v + b'\0'*pad
def parse(data):
    typ, ln, magic = struct.unpack('!HHI', data[:8]); attrs={}; i=20
    while i < 20+ln:
        t,l = struct.unpack('!HH', data[i:i+4]); attrs[t]=data[i+4:i+4+l]; i += 4 + l + ((4-l%4)%4)
    return typ, attrs
def msg(typ, attrs_bytes, tid):
    return struct.pack('!HHI', typ, len(attrs_bytes), MAGIC) + tid + attrs_bytes
def with_integrity(typ, body, tid, key):
    # length must include MESSAGE-INTEGRITY attr (24 bytes)
    hdr = struct.pack('!HHI', typ, len(body)+24, MAGIC) + tid
    mac = hmac.new(key, hdr+body, hashlib.sha1).digest()
    return hdr + body + attr(0x0008, mac)
def xfer(sock, proto, data):
    if proto=='udp': sock.send(data); return sock.recv(4096)
    sock.sendall(data); h = sock.recv(20); l = struct.unpack('!H', h[2:4])[0]; b=b''
    while len(b)<l: b += sock.recv(l-len(b))
    return h+b
def test(host, port, proto, user, pw):
    try:
        ip = socket.gethostbyname(host)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM if proto=='udp' else socket.SOCK_STREAM); s.settimeout(5); s.connect((ip, port))
        tid=os.urandom(12); rt = attr(0x0019, bytes([17,0,0,0]))
        typ, a = parse(xfer(s, proto, msg(0x0003, rt, tid)))
        if typ != 0x0113: return f'unexpected 0x{typ:04x}'
        realm, nonce = a.get(0x0014,b''), a.get(0x0015,b'')
        key = hashlib.md5(f'{user}:{realm.decode()}:{pw}'.encode()).digest()
        tid=os.urandom(12)
        body = rt + attr(0x0006, user.encode()) + attr(0x0014, realm) + attr(0x0015, nonce)
        typ, a = parse(xfer(s, proto, with_integrity(0x0003, body, tid, key)))
        if typ == 0x0103:
            x = a.get(0x0016); port_ = struct.unpack('!H', x[2:4])[0] ^ (MAGIC>>16); ipb = bytes(b ^ m for b,m in zip(x[4:8], struct.pack('!I',MAGIC)))
            return f'ALLOCATE SUCCESS relayed={socket.inet_ntoa(ipb)}:{port_} realm={realm.decode()}'
        err = a.get(0x0009, b'')
        return f'ALLOCATE ERROR 0x{typ:04x} code={err[2]*100+err[3] if err else "?"} {err[4:].decode(errors="ignore")}'
    except Exception as e: return f'FAIL {type(e).__name__} {e}'
for host,port,proto,u,p in [('openrelay.metered.ca',80,'udp','openrelayproject','openrelayproject'),('openrelay.metered.ca',80,'tcp','openrelayproject','openrelayproject'),('openrelay.metered.ca',443,'tcp','openrelayproject','openrelayproject'),('staticauth.openrelay.metered.ca',80,'udp','openrelayproject','openrelayproject'),('freestun.net',3478,'udp','free','free'),('freestun.net',3478,'tcp','free','free')]:
    print(f'{host}:{port}/{proto} user={u}:', test(host,port,proto,u,p))
