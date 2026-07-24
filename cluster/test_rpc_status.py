import requests
from cluster_utils import RPC_API


def test_rpc_endpoints():
    results = {}
    for chain, endpoints in RPC_API.items():
        chain_results = []
        for url in endpoints:
            try:
                # Semplice chiamata GET o POST a seconda del tipo di endpoint
                if url.endswith("/rpc") or url.endswith(".io") or url.endswith(".com") or url.endswith(".org"):
                    payload = {"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}
                    r = requests.post(url, json=payload, timeout=8)
                else:
                    r = requests.get(url, timeout=8)
                # Prova a decodificare JSON
                try:
                    data = r.json()
                    chain_results.append((url, r.status_code, True, data))
                except Exception:
                    chain_results.append((url, r.status_code, False, r.text[:100]))
            except Exception as e:
                chain_results.append((url, "ERROR", False, str(e)))
        results[chain] = chain_results
    return results

if __name__ == "__main__":
    import json
    res = test_rpc_endpoints()
    for chain, endpoints in res.items():
        print(f"\n{chain}:")
        for url, status, is_json, preview in endpoints:
            print(f"  {url} -> {status} | JSON: {is_json}")
            print(f"    {preview}")
