"""
Extractor per report exchange, allineati alla struttura usata in cluster/
(Binance, OKX, Bybit, Bitget, KuCoin, Coinbase), contestualizzati al modello
Analisi Report (flussi in/out + importi + IP + avvisi).
"""
from __future__ import annotations

from typing import Any, Callable

import pandas as pd

EXCHANGE_CHOICES: list[tuple[str, str]] = [
    ("auto", "Rilevamento automatico"),
    ("binance", "Binance"),
    ("okx", "OKX"),
    ("bybit", "Bybit"),
    ("bitget", "Bitget"),
    ("kucoin", "KuCoin"),
    ("coinbase", "Coinbase"),
    ("generic", "Generico"),
]

EXCHANGE_LABELS = {k: v for k, v in EXCHANGE_CHOICES}


def _app():
    import app as a
    return a


def _sheet_title(label: str) -> str:
    return _app()._sheet_title(label)


def _compact(name: str) -> str:
    return _app()._col_compact(name)


def _cell(v: Any) -> str:
    return _app()._cell(v)


def _safe_float(v: Any) -> float | None:
    return _app()._safe_float(v)


def _find_sheet(
    frames: list[tuple[str, pd.DataFrame]],
    *names: str,
) -> tuple[str, pd.DataFrame] | None:
    wanted = {_compact(n) for n in names}
    for label, df in frames:
        if _compact(_sheet_title(label)) in wanted:
            return label, df
    # fuzzy: titolo contiene il nome
    for label, df in frames:
        title = _compact(_sheet_title(label))
        for w in wanted:
            if w and (w == title or w in title or title in w):
                return label, df
    return None


def _cols(df: pd.DataFrame) -> set[str]:
    return {_compact(c) for c in df.columns}


def _get(row: Any, *aliases: str) -> str:
    wanted = {_compact(a) for a in aliases}
    for key in row.index:
        if _compact(str(key)) in wanted:
            return _cell(row.get(key))
    return ""


def _amount(row: Any) -> float | None:
    for alias in (
        "amount", "importo", "qty", "quantity", "volume", "coinamount",
        "size", "change", "total",
    ):
        v = _safe_float(_get(row, alias))
        if v is not None:
            return v
    return None


def _asset(coin: str, network: str = "") -> str:
    return _app()._asset_with_network(coin, network)


def _tx(
    *,
    source: str,
    direction: str,
    amount: float,
    asset: str,
    when: str = "",
    wallet: str = "",
    txid: str = "",
) -> dict[str, Any]:
    a = _app()
    wallet = wallet or ""
    txid = txid or ""
    if a._is_tx_hash(wallet):
        if not txid:
            txid = wallet
        wallet = ""
    if a._is_evm_address(txid) and not wallet:
        wallet, txid = txid, ""
    return {
        "source": source,
        "direction": direction,
        "amount": abs(amount),
        "asset": asset or "—",
        "when": when,
        "wallet": wallet,
        "txid": txid,
    }


def _ips_from(frames: list[tuple[str, pd.DataFrame]], *sheet_names: str) -> list[str]:
    a = _app()
    found: list[str] = []
    if sheet_names:
        for name in sheet_names:
            hit = _find_sheet(frames, name)
            if hit:
                found.extend(a._extract_ips_from_df(hit[1], "ip"))
    for label, df in frames:
        kind = a._sheet_kind(label)
        if kind == "ip":
            found.extend(a._extract_ips_from_df(df, "ip"))
    return found


def _profile_from(frames: list[tuple[str, pd.DataFrame]]) -> dict[str, str]:
    a = _app()
    profile: dict[str, str] = {}
    for label, df in frames:
        kind = a._sheet_kind(label)
        if kind not in ("profile", "unknown"):
            continue
        kv = a._extract_profile_kv(df, loose=(kind == "profile"))
        if len(kv) >= 2 or (kind == "profile" and kv):
            profile.update(kv)
        else:
            profile.update(a._extract_profile_cols(df, loose=(kind == "profile")))
    return profile


def detect_exchange(frames: list[tuple[str, pd.DataFrame]]) -> str | None:
    if not frames:
        return None
    titles = {_compact(_sheet_title(label)) for label, _ in frames}

    if "transactionhistory" in titles and (
        "depositaddresses" in titles or "depositaddress" in titles
    ):
        return "coinbase"
    if "transactionhistory" in titles:
        hit = _find_sheet(frames, "Transaction History")
        if hit and ({"transactionhash", "to", "type"} & _cols(hit[1])):
            return "coinbase"

    if len(frames) == 1:
        cols = _cols(frames[0][1])
        if ("type" in cols or "category" in cols) and (
            "coin" in cols or "currency" in cols
        ) and (
            "toaddress" in cols
            or "transactionhashtxid" in cols
            or "subcategory" in cols
        ):
            return "bitget"

    dep = (
        _find_sheet(frames, "Deposit History", "Deposit_History", "DepositHistory", "Deposit history")
        or _find_sheet(frames, "Deposits", "Deposit")
    )
    if dep is not None:
        cols = _cols(dep[1])
        if "datasrcdesc" in cols or ("coin" in cols and "toaddress" in cols and "currency" not in cols):
            return "bybit"
        if "coin" in cols and "hash" in cols and "currency" not in cols and "network" not in cols:
            return "kucoin"
        if "currency" in cols and "address" in cols and "depositaddress" not in cols:
            return "okx"
        if "currency" in cols and (
            "depositaddress" in cols or "network" in cols or "txid" in cols
        ):
            return "binance"

    if "deposithistory" in titles and "withdrawhistory" in titles:
        # KuCoin compact names collide with others; prefer column sniff above.
        return "kucoin"
    if "deposit_history" in {_compact(_sheet_title(l).replace(" ", "_")) for l, _ in frames}:
        return "okx"

    return None


def extract_binance(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    a = _app()
    warnings: list[str] = []
    txs: list[dict[str, Any]] = []
    skipped_internal = skipped_fiat = skipped_beacon = skipped_status = 0

    dep = _find_sheet(frames, "Deposit History", "Deposit history", "DepositHistory")
    if dep:
        label, df = dep
        for _, row in df.iterrows():
            currency = _get(row, "Currency", "Coin", "Asset")
            network = _get(row, "Network", "Chain")
            wallet = _get(row, "Deposit Address", "Address")
            txid = _get(row, "txId", "TxID", "Transaction ID", "Hash")
            when = _get(row, "Date(UTC)", "Date", "Time")
            amount = _amount(row)
            status = _get(row, "Status")
            if a._is_failed_status(status):
                skipped_status += 1
                continue
            if not wallet or amount is None:
                continue
            if currency.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            if a._is_bnb_beacon(wallet, network):
                skipped_beacon += 1
                continue
            txs.append(_tx(
                source=label, direction="in", amount=amount,
                asset=_asset(currency, network), when=when, wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("Binance: foglio «Deposit History» non trovato.")

    wd = _find_sheet(frames, "Withdrawal History", "Withdrawal history", "WithdrawHistory")
    if wd:
        label, df = wd
        for _, row in df.iterrows():
            currency = _get(row, "Currency", "Coin", "Asset")
            network = _get(row, "Network", "Chain")
            wallet = _get(row, "Destination Address", "Address", "Deposit Address")
            txid = _get(row, "txId", "TxID", "Transaction ID", "Hash")
            when = _get(row, "Date(UTC)", "Date", "Time")
            cpid = _get(row, "CounterParty ID", "Counterparty ID", "CounterPartyID")
            amount = _amount(row)
            status = _get(row, "Status")
            if a._is_failed_status(status):
                skipped_status += 1
                continue
            if cpid:
                skipped_internal += 1
                continue
            if not wallet or not txid or amount is None:
                continue
            if currency.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            if a._is_bnb_beacon(wallet, network):
                skipped_beacon += 1
                continue
            txs.append(_tx(
                source=label, direction="out", amount=amount,
                asset=_asset(currency, network), when=when, wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("Binance: foglio «Withdrawal History» non trovato.")

    if skipped_internal:
        warnings.append(f"Binance: {skipped_internal} prelievi interni (CounterParty ID) esclusi.")
    if skipped_fiat:
        warnings.append(f"Binance: {skipped_fiat} movimenti fiat esclusi.")
    if skipped_beacon:
        warnings.append(f"Binance: {skipped_beacon} movimenti Beacon (bnb) esclusi.")
    if skipped_status:
        warnings.append(f"Binance: {skipped_status} transazioni annullate/fallite escluse.")

    return _profile_from(frames), txs, _ips_from(
        frames, "Login History", "Login Log", "Device History", "Account Activity",
    ), warnings


def extract_okx(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    warnings: list[str] = []
    txs: list[dict[str, Any]] = []
    skipped_fiat = 0
    a = _app()

    dep = _find_sheet(frames, "Deposit_History", "Deposit History", "DepositHistory")
    if dep:
        label, df = dep
        for _, row in df.iterrows():
            currency = _get(row, "currency", "coin", "asset")
            wallet = _get(row, "address", "to", "deposit address")
            txid = _get(row, "txid", "tx id", "hash", "txHash")
            when = _get(row, "time", "ts", "create time", "date")
            amount = _amount(row)
            if not wallet or amount is None:
                continue
            if currency.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            txs.append(_tx(
                source=label, direction="in", amount=amount,
                asset=_asset(currency, _get(row, "chain", "network")), when=when,
                wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("OKX: foglio «Deposit_History» non trovato.")

    wd = _find_sheet(frames, "Withdrawal_History", "Withdrawal History", "WithdrawHistory")
    if wd:
        label, df = wd
        for _, row in df.iterrows():
            currency = _get(row, "currency", "coin", "asset")
            wallet = _get(row, "address", "to", "to address")
            txid = _get(row, "txid", "tx id", "hash", "txHash")
            when = _get(row, "time", "ts", "create time", "date")
            amount = _amount(row)
            if not wallet or not txid or amount is None:
                continue
            if currency.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            txs.append(_tx(
                source=label, direction="out", amount=amount,
                asset=_asset(currency, _get(row, "chain", "network")), when=when,
                wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("OKX: foglio «Withdrawal_History» non trovato.")

    if skipped_fiat:
        warnings.append(f"OKX: {skipped_fiat} movimenti fiat esclusi.")

    return _profile_from(frames), txs, _ips_from(
        frames, "Login History", "Account Activity",
    ), warnings


def extract_bybit(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    warnings: list[str] = []
    txs: list[dict[str, Any]] = []
    skipped_fiat = skipped_internal = 0
    a = _app()

    dep = _find_sheet(frames, "Deposit history", "Deposit History", "DepositHistory")
    if dep:
        label, df = dep
        for _, row in df.iterrows():
            coin = _get(row, "coin", "currency", "asset")
            wallet = _get(row, "to_address", "to address", "address", "deposit address")
            txid = _get(row, "tx_id", "txid", "hash")
            when = _get(row, "create_time", "date", "time", "timestamp")
            amount = _amount(row)
            if not wallet or amount is None:
                continue
            if coin.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            txs.append(_tx(
                source=label, direction="in", amount=amount,
                asset=_asset(coin, _get(row, "chain", "network")), when=when,
                wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("Bybit: foglio «Deposit history» non trovato.")

    wd = _find_sheet(frames, "Withdrawal history", "Withdrawal History", "WithdrawHistory")
    if wd:
        label, df = wd
        for _, row in df.iterrows():
            coin = _get(row, "coin", "currency", "asset")
            wallet = _get(row, "to_address", "to address", "address")
            txid = _get(row, "tx_id", "txid", "hash")
            when = _get(row, "create_time", "date", "time", "timestamp")
            src = _get(row, "data_src_desc", "datasrcdesc", "subcategory")
            amount = _amount(row)
            if _compact(src) == "fiat" or coin.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            if not wallet:
                skipped_internal += 1
                continue
            if not txid or amount is None:
                continue
            txs.append(_tx(
                source=label, direction="out", amount=amount,
                asset=_asset(coin, _get(row, "chain", "network")), when=when,
                wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("Bybit: foglio «Withdrawal history» non trovato.")

    if skipped_fiat:
        warnings.append(f"Bybit: {skipped_fiat} prelievi fiat esclusi.")
    if skipped_internal:
        warnings.append(f"Bybit: {skipped_internal} movimenti senza destinatario (probabile interno) esclusi.")

    return _profile_from(frames), txs, _ips_from(
        frames, "Login history", "Login History",
    ), warnings


def extract_kucoin(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    warnings: list[str] = []
    txs: list[dict[str, Any]] = []
    skipped_fiat = 0
    a = _app()

    dep = _find_sheet(frames, "DepositHistory", "Deposit History", "Deposit_History")
    if dep:
        label, df = dep
        for _, row in df.iterrows():
            coin = _get(row, "coin", "currency", "asset")
            wallet = _get(row, "address", "to", "deposit address")
            txid = _get(row, "hash", "txid", "tx_id", "walletTxId")
            when = _get(row, "createdAt", "create_time", "date", "time")
            amount = _amount(row)
            if not wallet or amount is None:
                continue
            if coin.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            txs.append(_tx(
                source=label, direction="in", amount=amount,
                asset=_asset(coin, _get(row, "chain", "network")), when=when,
                wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("KuCoin: foglio «DepositHistory» non trovato.")

    wd = _find_sheet(frames, "WithdrawHistory", "Withdrawal History", "WithdrawalHistory")
    if wd:
        label, df = wd
        for _, row in df.iterrows():
            coin = _get(row, "coin", "currency", "asset")
            wallet = _get(row, "address", "to")
            txid = _get(row, "hash", "txid", "tx_id", "walletTxId")
            when = _get(row, "createdAt", "create_time", "date", "time")
            amount = _amount(row)
            if not wallet or amount is None:
                continue
            if coin.lower() in a.FIAT_ASSETS:
                skipped_fiat += 1
                continue
            txs.append(_tx(
                source=label, direction="out", amount=amount,
                asset=_asset(coin, _get(row, "chain", "network")), when=when,
                wallet=wallet, txid=txid,
            ))
    else:
        warnings.append("KuCoin: foglio «WithdrawHistory» non trovato.")

    if skipped_fiat:
        warnings.append(f"KuCoin: {skipped_fiat} movimenti fiat esclusi.")

    return _profile_from(frames), txs, _ips_from(frames), warnings


def extract_bitget(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    warnings: list[str] = []
    txs: list[dict[str, Any]] = []
    skipped_internal = skipped_fiat = 0
    a = _app()

    # Bitget: di solito un unico foglio con Type / Coin / To address
    target: tuple[str, pd.DataFrame] | None = None
    for label, df in frames:
        cols = _cols(df)
        if ("type" in cols or "category" in cols) and ("coin" in cols or "currency" in cols):
            target = (label, df)
            break
    if target is None and frames:
        target = frames[0]

    if not target:
        warnings.append("Bitget: nessun foglio leggibile.")
        return {}, [], [], warnings

    label, df = target
    for _, row in df.iterrows():
        sub = _get(row, "subcategory", "sub category", "sub cat", "remark")
        if a._looks_internal(sub):
            skipped_internal += 1
            continue
        type_val = _get(row, "type", "category", "ordertype").lower()
        coin = _get(row, "coin", "currency", "asset", "token")
        network = _get(
            row, "network", "chain", "network type", "chain name",
            "chain type", "network protocol",
        )
        wallet = _get(
            row, "to address", "toaddress", "address", "destination address",
            "wallet address", "toaddr",
        )
        txid = _get(
            row, "transaction hash (txid)", "transactionhashtxid", "txid",
            "tx hash", "transaction hash", "hash",
        )
        when = _get(row, "date", "time", "timestamp", "create time")
        amount = _amount(row)
        if coin.lower() in a.FIAT_ASSETS:
            skipped_fiat += 1
            continue
        if amount is None:
            continue
        if type_val in ("deposit", "deposits", "receive", "received"):
            if not wallet:
                continue
            direction = "in"
        elif type_val in ("withdrawal", "withdraw", "send", "sent"):
            if not txid:
                continue
            direction = "out"
        else:
            continue
        txs.append(_tx(
            source=label, direction=direction, amount=amount,
            asset=_asset(coin, network), when=when, wallet=wallet, txid=txid,
        ))

    if skipped_internal:
        warnings.append(f"Bitget: {skipped_internal} internal transfer esclusi.")
    if skipped_fiat:
        warnings.append(f"Bitget: {skipped_fiat} movimenti fiat esclusi.")
    if not txs:
        warnings.append("Bitget: nessuna riga deposit/withdrawal riconosciuta.")

    return _profile_from(frames), txs, _ips_from(frames), warnings


def extract_coinbase(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    """Transaction History: Send/Receive. Deposit Addresses è rubrica, non flussi."""
    warnings: list[str] = []
    txs: list[dict[str, Any]] = []
    skipped_trade = skipped_fiat = 0
    a = _app()

    hist = _find_sheet(frames, "Transaction History", "Transactions", "Account")
    if not hist:
        warnings.append("Coinbase: foglio «Transaction History» non trovato.")
        return _profile_from(frames), [], _ips_from(frames), warnings

    label, df = hist
    for _, row in df.iterrows():
        type_val = _get(row, "type", "transaction type")
        if a._is_exchange_trade(type_val):
            skipped_trade += 1
            continue
        direction = a._direction_of(type_val, None)
        if direction is None:
            compact = _compact(type_val)
            if compact in ("send", "sent", "withdrawal"):
                direction = "out"
            elif compact in ("receive", "received", "deposit"):
                direction = "in"
            else:
                continue
        currency = _get(row, "currency", "asset", "asset type", "amount currency")
        network = _get(row, "network", "chain")
        wallet = _get(row, "to", "to address", "destination")
        txid = _get(row, "transaction hash", "tx hash", "hash", "txid")
        when = _get(row, "timestamp", "date", "time")
        amount = _amount(row)
        if amount is None:
            amount = _safe_float(_get(row, "quantity transacted", "quantity"))
        if amount is None:
            continue
        if currency.lower() in a.FIAT_ASSETS or type_val.lower().startswith("fiat"):
            skipped_fiat += 1
            continue
        if direction == "out" and not txid:
            continue
        txs.append(_tx(
            source=label, direction=direction, amount=amount,
            asset=_asset(currency, network), when=when, wallet=wallet, txid=txid,
        ))

    if skipped_trade:
        warnings.append(f"Coinbase: {skipped_trade} buy/sell/convert esclusi (non sono flussi wallet).")
    if skipped_fiat:
        warnings.append(f"Coinbase: {skipped_fiat} movimenti fiat esclusi.")
    if _find_sheet(frames, "Deposit Addresses"):
        warnings.append("Coinbase: «Deposit Addresses» usato solo come rubrica (non conteggiato nei flussi).")

    return _profile_from(frames), txs, _ips_from(frames), warnings


EXTRACTORS: dict[str, Callable[..., tuple]] = {
    "binance": extract_binance,
    "okx": extract_okx,
    "bybit": extract_bybit,
    "bitget": extract_bitget,
    "kucoin": extract_kucoin,
    "coinbase": extract_coinbase,
}


def resolve_exchange(
    frames: list[tuple[str, pd.DataFrame]],
    preferred: str | None = None,
) -> tuple[str, bool]:
    """Ritorna (exchange_id, detected). detected=True se scelto via auto-detect."""
    pref = (preferred or "").strip().lower()
    if pref in EXTRACTORS:
        return pref, False
    if pref in ("", "auto"):
        detected = detect_exchange(frames)
        if detected:
            return detected, True
        return "generic", True
    if pref == "generic":
        return "generic", False
    detected = detect_exchange(frames)
    if detected:
        return detected, True
    return "generic", True


def collect_for_exchange(
    exchange: str,
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    fn = EXTRACTORS.get(exchange)
    if not fn:
        raise KeyError(exchange)
    return fn(frames)
