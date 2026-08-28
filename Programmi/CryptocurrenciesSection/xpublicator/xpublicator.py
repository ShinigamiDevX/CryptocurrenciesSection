#!/usr/bin/env python3

# Copyright © 2024 National Criminal Investigation Service, Norway (Kripos) / NC3
# Maintainer: Jens-Petter Sandvik <jens-petter.sandvik@politiet.no>

import argparse
import base58
import bech32
import hmac
import hashlib
import tqdm
from Crypto.Hash import RIPEMD
from Crypto.Hash import keccak

ECLIB = ''
try:
    from fastecdsa import curve
    from fastecdsa.encoding import sec1
    ECLIB = 'fastecdsa'
except ImportError:
    from ecpy.curves import Curve
    ECLIB = 'ecpy'

VERSION = '1.3'

SECP256K1_N = b'\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFE\xBA\xAE\xDC\xE6\xAF\x48\xA0\x3B\xBF\xD2\x5E\x8C\xD0\x36\x41\x41'


def get_path(path: str) -> list[list[int]]:
    '''Return a tree containing the derivation paths given by path.
    No need for hardened paths, as we only have the xpub.'''
    assert(path[0] == 'x')    # x signifies the xpub key
    result = []
    branches = path.split('/')
    for branch in branches[1:]:
        tmpres = []
        blist = branch.split(',')
        for i in blist:
            if '-' in i:
                be = i.split('-')
                r = range(int(be[0]), int(be[1])+1)
                tmpres.extend(r)
            else:
                tmpres.append(int(i))
        assert max(tmpres) < 2**31, 'No support for hardened keys'
        result.append(tmpres)
    return result


def decode_xpub(xpub: str) -> tuple[dict, bool]:
    '''Return a structure of the decoded xpub key'''
    pubkey = base58.b58decode(xpub)
    # hexdump.hexdump(pubkey)
    if not ((pubkey[0:4] == b'\x04\x88\xb2\x1e')
            or (pubkey[0:4] == b'\x04\x9d\x7c\xb2')
            or (pubkey[0:4] == b'\x04\xb2\x47\x46')
            or (pubkey[0:4] == b'\x02\x95\xb4\x3f')
            or (pubkey[0:4] == b'\x02\xaa\x7e\xd3')):
        assert False, 'Only supports xpub, ypub, zpub'

    x = {'level': pubkey[4],
         'parentfingerprint': pubkey[5:9],
         'childnumber': pubkey[9:13],
         'chaincode': pubkey[13:45],
         'pubkey': pubkey[45:78],
         'checksum': pubkey[78:]}
    x['calc_checksum'] = hashlib.sha256(hashlib.sha256(pubkey[:-4]).digest()).digest()[0:4]

    return (x, x['checksum'] == x['calc_checksum'])


def derive_pubkey_fastecdsa(pub: bytes, chain: bytes, index: int) -> tuple[bytes, bytes]:
    '''Derive the new publickey based on pub, chain and index'''
    assert index < 2**31, f'Hardened keys not supported, index = 0x{index:x} >= 0x{2**31:x}'
    h = hmac.new(chain, pub + index.to_bytes(4, byteorder='big'), digestmod='sha512')
    i = h.digest()
    il = int.from_bytes(i[:32], 'big')
    # ir = int.from_bytes(i[32:], 'big')

    if il > int.from_bytes(SECP256K1_N, 'big'):
        return (None, None)

    c = curve.secp256k1
    kpar = sec1.SEC1Encoder.decode_public_key(pub, c)
    pil = il * c.G
    kchild = kpar + pil

    if kchild == kchild.IDENTITY_ELEMENT:
        # Point at infinity
        return (None, None)

    return (sec1.SEC1Encoder.encode_public_key(kchild), i[32:])


def derive_pubkey_ecpy(pub: bytes, chain: bytes, index: int) -> tuple[bytes, bytes]:
    '''Derive the new publickey based on pub, chain and index, using ECPy functions'''
    assert index < 2**31, f'Hardened keys not supported, index = 0x{index:x} >= 0x{2**31:x}'
    h = hmac.new(chain, pub+index.to_bytes(4, byteorder='big'), digestmod='sha512')
    i = h.digest()
    il = int.from_bytes(i[:32], 'big')

    if il > int.from_bytes(SECP256K1_N, 'big'):
        return (None, None)

    c = Curve.get_curve('secp256k1')
    kpar = c.decode_point(pub)
    pil = il * c.generator
    kchild = kpar + pil

    if kchild == c.infinity:
        return (None, None)

    return (bytes(c.encode_point(kchild, compressed=True)), i[32:])


def uncompress_key_fastecdsa(key: bytes) -> bytes:
    '''Make sure the key is uncompressed, for eth addresses'''
    point = sec1.SEC1Encoder.decode_public_key(key, curve.secp256k1)
    return sec1.SEC1Encoder.encode_public_key(point, False)


def uncompress_key_ecpy(key: bytes) -> bytes:
    '''Make sure public key is uncompressed, for eth addresses'''
    c = Curve.get_curve('secp256k1')
    point = c.decode_point(key)
    return bytes(c.encode_point(point, compressed=False))


if ECLIB == 'fastecdsa':
    derive_pubkey = derive_pubkey_fastecdsa
    uncompress_key = uncompress_key_fastecdsa
else:
    derive_pubkey = derive_pubkey_ecpy
    uncompress_key = uncompress_key_ecpy


def P2PKHaddr(key: bytes) -> str:
    '''Generate a p2phk address from key'''
    h = RIPEMD.new(hashlib.sha256(key).digest()).digest()
    return base58.b58encode_check(b'\0' + h).decode()


def P2WPKHaddr(key: bytes, version=0) -> str:
    '''Generate a p2wpkh address from key'''
    s = hashlib.sha256(key).digest()
    r = RIPEMD.new(s).digest()
    return bech32.encode('bc', version, r)


def P2WPKH_P2SHaddr(key: bytes) -> str:
    '''Generate a p2wpkh-p2sh address from key'''
    keyhash = RIPEMD.new(hashlib.sha256(key).digest()).digest()
    scriptsig = b'\0\x14' + keyhash
    addr = RIPEMD.new(hashlib.sha256(scriptsig).digest()).digest()
    return base58.b58encode_check(b'\5' + addr).decode()


def ETHchecksum(addr: bytes) -> str:
    '''Return checksum address'''
    addrhash = keccak.new(data=addr.hex().encode('utf-8'), digest_bits=256).digest().hex()
    return '0x' + ''.join([x.upper() if y >= '8' else x for (x, y) in zip(addr.hex(), addrhash)])


def ETHaddr(key: bytes, noethchecksum: bool) -> str:
    '''Generate an Eth address from key'''
    unkey = uncompress_key(key)[1:]
    keyhash = keccak.new(data=unkey, digest_bits=256).digest()
    if noethchecksum:
        return '0x' + keyhash[-20:].hex()
    else:
        return ETHchecksum(keyhash[-20:])


def make_addresses(key: bytes, noethchecksum: bool) -> dict:
    '''Make a dictionary of all implemented address formats'''
    ret = {}
    ret['p2pkh'] = P2PKHaddr(key)
    ret['p2sh'] = P2WPKH_P2SHaddr(key)
    ret['p2wpkh'] = P2WPKHaddr(key)
    ret['eth'] = ETHaddr(key, noethchecksum)
    return ret


def get_keys(pub: bytes, chain: bytes, indextree: list, level: int, progbardisable: bool = False, noethchecksum: bool = False) -> dict:
    '''Return the tree filled with keys for each index in the indextree'''
    keys = []

    # Get the child key for the indexes
    keys = {i: dict(zip(['key', 'chain', 'child'], (*derive_pubkey(pub, chain, i), {}))) for i in indextree[0]}

    if len(indextree) > 1:
        # This is not the last branch
        childtree = indextree[1:]
        for k in tqdm.tqdm(keys, desc=f'xpub key level: {level}', disable=progbardisable, leave=False):
            keys[k].update(make_addresses(keys[k]['key'], noethchecksum))
            keys[k]['child'] = get_keys(keys[k]['key'], keys[k]['chain'], childtree, level+1)
    else:
        # Leaf, get addresses
        for k in tqdm.tqdm(keys, desc=f'xpub key level: {level}', disable=progbardisable, leave=False):
            keys[k].update(make_addresses(keys[k]['key'], noethchecksum))
    return keys


def keytree_flatten(keys: dict, curpath: str = 'x/', addrtypes: list[str] = ['w2pkh'], includeall: bool = False) -> dict:
    '''Serialize the keytree, to make a dictionary on the form {"path": {addrtype: addr}}
    If includall == False, only include leaf nodes, otherwise include all.'''
    keylist = dict()

    for k in keys:
        kpath = f'{curpath}{k}'
        if keys[k]['child']:
            keylist.update(keytree_flatten(keys[k]['child'], f'{kpath}/', addrtypes, includeall))
        if keys[k]['child'] == {} or includeall:
            if kpath not in keylist:
                keylist[kpath] = dict()
            for t in addrtypes:
                keylist[kpath][t] = keys[k][t]

    return keylist


def xpub_to_address(xpub: str, path: list[str], addrtypes: list[str], alladdresses: bool, noethchecksum: bool = False) -> list[str]:
    '''Transform the xpub to addresses given the derivation path'''

    hideprogressbar = True
    paths = [get_path(p) for p in path]

    x, valid = decode_xpub(xpub)
    assert valid, f'xpub checksum mismatch: {x["calc_checksum"]} != {x["checksum"]}'

    keys = None
    for p in paths:
        # The keys are structured in a tree, with a key index and child nodes.
        if len(p) > 0:
            keys = get_keys(x['pubkey'], x['chaincode'], p, x['level'], hideprogressbar, noethchecksum)

    # create a list of addresses from the addresses in the leaf nodes
    if keys:
        keylist = keytree_flatten(keys, 'x/', addrtypes, includeall=alladdresses)
    else:
        keylist = {}

    if alladdresses or paths == [[]]:
        addrs = make_addresses(x['pubkey'], noethchecksum)
        keylist['x'] = {}
        for t in addrtypes:
            keylist['x'][t] = addrs[t]

    return keylist


def qprint(text: str, quiet: bool) -> None:
    if not quiet:
        print(text)


def print_results(xpublist: dict, output: str, quiet: bool) -> None:
    ''' Print results for each xpub key '''
    f = None
    if output:
        f = open(output, "w")
        f.write('xpub,path,type,address\n')

    for x in xpublist:
        qprint(f'xpub: {x}', quiet)
        for p in xpublist[x]:
            for t in xpublist[x][p]:
                qprint(f'    {p}: ({t}) {xpublist[x][p][t]}', quiet)
                if f:
                    f.write(f'{x},{p},{t},{xpublist[x][p][t]}\n')
    if f:
        f.close()


def convert_xpub(xpub: str) -> list[str]:
    formats = {'xpub': b'\x04\x88\xb2\x1e',
               'ypub': b'\x04\x9d\x7c\xb2',
               'zpub': b'\x04\xb2\x47\x46',
               'Ypub': b'\x02\x95\xb4\x3f',
               'Zpub': b'\x02\xaa\x7e\xd3'}

    pubkey = base58.b58decode(xpub)
    res = []
    for f in formats:
        if pubkey[0:4] == formats[f]:
            continue
        res.append(base58.b58encode_check(formats[f] + pubkey[4:-4]).decode('utf-8'))

    return res


def print_xpub_info(xpub: str) -> None:
    '''Print info from xpub key'''
    x, valid = decode_xpub(xpub)
    if valid:
        print(f'{xpub} is a valid key')
        print(f'  Key checksum 0x{x["checksum"].hex()} equals calculated checksum 0x{x["calc_checksum"].hex()}')
    else:
        print(f'{xpub} is not a valid key:')
        print(f'  Key checksum 0x{x["checksum"].hex()} does not equal calculated checksum 0x{x["calc_checksum"].hex()}')

    print(f'  Key depth (0 is master key): {x["level"]}')
    print(f'  Parent fingerprint: 0x{x["parentfingerprint"].hex()}')
    print(f'  Child number: 0x{x["childnumber"].hex()}')
    print(f'  Chain code: 0x{x["chaincode"].hex()}')
    print(f'  Public key: 0x{x["pubkey"].hex()}')


if '__main__' == __name__:
    addrtypes = ['p2pkh', 'p2sh', 'p2wpkh', 'eth']
    aparse = argparse.ArgumentParser(description='Generate and search for addresses from extended public keys (-x, y- and zpub formats).')
    aparse.add_argument('xpub', nargs='+', help='xpub keys that will be used')
    aparse.add_argument('-p', '--path', action='append', help='The derivation path to use, relative to the xpub key. E.g. x/0,2/0-10,20/0-20')
    aparse.add_argument('-a', '--alladdresses', action='store_true', help='Show addresses for all xpub keys in the hierarchy, not only leaf keys')
    aparse.add_argument('-t', '--addresstypes', choices=addrtypes, nargs='+', default=addrtypes, help='The address types to generate')
    aparse.add_argument('-c', '--noethchecksum', action='store_true', help='Write ETH addresses without checksum')
    aparse.add_argument('-f', '--findpath', metavar='ADDRESS', nargs='+', help='Find derivation path from the xpub that results in the given addresses')
    aparse.add_argument('-o', '--output', help='Write results to csv file')
    aparse.add_argument('-q', '--quiet', action='store_true', help='Suppress writing to terminal')
    aparse.add_argument('-x', '--xpubconvert', action='store_true', help='Convert given keys to other formats, don\'t derive keys')
    aparse.add_argument('-i', '--info', action='store_true', help='Print info about xpub key')
    aparse.add_argument('-v', '--version', action='store_true', help='Print version information')
    args = aparse.parse_args()

    if args.version:
        print(f'{aparse.prog} version {VERSION} ({ECLIB})')

    qprint(f'Using library: {ECLIB}', args.quiet)
    if ECLIB == 'fastecdsa':
        derive_pubkey = derive_pubkey_fastecdsa
        uncompress_key = uncompress_key_fastecdsa
    else:
        derive_pubkey = derive_pubkey_ecpy
        uncompress_key = uncompress_key_ecpy

    if args.info:
        for x in args.xpub:
            print_xpub_info(x)

    if args.xpubconvert:
        keys = {}
        for x in args.xpub:
            keys[x] = convert_xpub(x)
            print(f'> {x}')
            for x in keys[x]:
                print(f'  {x}')
        exit()

    if not args.path:
        args.path = ["x/0-10/0-20"]
    # print(args)
    results = {}
    for x in args.xpub:
        results[x] = xpub_to_address(x, args.path, args.addresstypes, args.alladdresses, args.noethchecksum)

    if args.findpath:
        found = False
        for x in results:
            for p in results[x]:
                for t in results[x][p]:
                    if results[x][p][t] in args.findpath:
                        print(f'Address {results[x][p][t]}: xpub {x}, derivation path: {p} ({t})')
                        found = True
        if not found:
            if len(args.findpath) > 1:
                suffix = "es"
            else:
                suffix = ""
            print(f'No path found to address{suffix}: {", ".join(args.findpath)}')

    if not args.findpath:
        print_results(results, args.output, args.quiet)
