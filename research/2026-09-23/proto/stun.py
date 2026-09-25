import socket, os, struct, time
def stun(host, port):
    tid = os.urandom(12)
    req = struct.pack('!HHI', 0x0001, 0, 0x2112A442) + tid
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(3)
    try:
        ip = socket.gethostbyname(host)
        t0=time.time(); s.sendto(req, (ip, port)); data,_ = s.recvfrom(2048); rtt=(time.time()-t0)*1000
        typ = struct.unpack('!H', data[:2])[0]
        return f'{host}:{port} -> {ip} type=0x{typ:04x} rtt={rtt:.0f}ms'
    except Exception as e: return f'{host}:{port} FAIL {e}'
for h,p in [('stun.l.google.com',19302),('stun1.l.google.com',19302),('stun2.l.google.com',19302),('stun.cloudflare.com',3478),('openrelay.metered.ca',80)]:
    print(stun(h,p))
