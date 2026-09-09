def calc_ma(close_list, period):
    ma_arr = []
    length = len(close_list)
    for i in range(length):
        start_idx = max(0, i - period + 1)
        slice_close = close_list[start_idx:i+1]
        avg = sum(slice_close) / len(slice_close)
        ma_arr.append(round(avg, 2))
    return ma_arr

def calc_macd(data_list):
    closes = [float(row[5]) for row in data_list]
    length = len(closes)
    if length == 0:
        return []
    ema12 = [0.0] * length
    ema26 = [0.0] * length
    ema12[0] = closes[0]
    ema26[0] = closes[0]
    for i in range(1, length):
        ema12[i] = ema12[i-1] * 11/13 + closes[i] * 2/13
        ema26[i] = ema26[i-1] * 25/27 + closes[i] * 2/27
    dif = [0.0] * length
    for i in range(length):
        dif[i] = ema12[i] - ema26[i]
    dea = [0.0] * length
    dea[0] = dif[0]
    for i in range(1, length):
        dea[i] = dea[i-1] * 8/10 + dif[i] * 2/10
    bar = [0.0] * length
    for i in range(length):
        bar[i] = (dif[i] - dea[i]) * 2
    macd_res = []
    for i, row in enumerate(data_list):
        macd_res.append({
            "time": row[0],
            "dif": round(dif[i], 4),
            "dea": round(dea[i], 4),
            "bar": round(bar[i], 4)
        })
    return macd_res

def calc_kdj(data_list):
    close_arr = [float(row[5]) for row in data_list]
    high_arr = [float(row[3]) for row in data_list]
    low_arr = [float(row[4]) for row in data_list]
    kdj_list = []
    k = 50.0
    d = 50.0
    for i in range(len(data_list)):
        start = max(0, i - 8)
        slice_high = max(high_arr[start:i+1])
        slice_low = min(low_arr[start:i+1])
        c = close_arr[i]
        if slice_high == slice_low:
            rsv = 50.0
        else:
            rsv = (c - slice_low) / (slice_high - slice_low) * 100
        k = k * 2 / 3 + rsv * 1 / 3
        d = d * 2 / 3 + k * 1 / 3
        j = 3 * k - 2 * d
        kdj_list.append({
            "time": data_list[i][0],
            "k": round(k, 2),
            "d": round(d, 2),
            "j": round(j, 2)
        })
    return kdj_list

def normalize_sequence(n: int, seq: list):
    """
    对序列 seq 进行长度规整和方向控制

    Rule:
    ------
    1. 若 n == 0,返回空列表。
    2. 若 n < 0:
       - 先将 seq 倒序。
       - 然后将 n 取绝对值,按正数规则处理倒序后的列表。
    3. 若 n > 0:
       - 若 len(seq) < n,且 seq 非空,重复 seq 的最后一个元素,追加到末尾,直到长度为 n。
       - 若 len(seq) > n,截断,保留前 n 个。
       - 若 len(seq) == n,原样返回。

    Parameter:
    ------
        n (int): 目标长度（正数表示正常顺序,负数表示倒序）
        seq (list): 输入列表
    """
    if n == 0:
        return []

    if n < 0:
        seq = seq[::-1]          # 先倒序
        n = -n                   # 转为正数处理

    # 现在 n > 0,对 seq 进行长度调整
    if not seq:                  # 空列表无法补全
        return []
    if len(seq) < n:
        last = seq[-1]
        return seq + [last] * (n - len(seq))
    elif len(seq) > n:
        return seq[:n]
    else:
        return seq