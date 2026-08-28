import requests
from cluster_utils import RPC_API, chainalysis_auth_header

def test_all_rpc_and_chainalysis(address):
    for chain, endpoints in RPC_API.items():
        print(f"\n{chain}:")
        for url in endpoints:
            url_test = url
            headers = {}
            if "chainalysis.com" in url:
                url_test = url.replace("<address>", address)
                headers = chainalysis_auth_header()
            try:
                if "chainalysis.com" in url_test:
                    r = requests.get(url_test, headers=headers, timeout=10)
                elif url_test.endswith("/rpc") or url_test.endswith(".io") or url_test.endswith(".com") or url_test.endswith(".org"):
                    payload = {"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}
                    r = requests.post(url_test, json=payload, headers=headers, timeout=10)
                else:
                    r = requests.get(url_test, headers=headers, timeout=10)
                try:
                    data = r.json()
                    print(f"  {url_test} -> {r.status_code} | JSON: True")
                except Exception:
                    print(f"  {url_test} -> {r.status_code} | JSON: False | {r.text[:100]}")
            except Exception as e:
                print(f"  {url_test} -> ERROR | {e}")

if __name__ == "__main__":
    # Usa un address valido per test endpoint API address-based.
    test_address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    test_all_rpc_and_chainalysis(test_address)
