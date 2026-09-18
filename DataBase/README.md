数据库说明 v1.0.3
    v1.0.3 变更: daily_quote 新增 amount(成交额/元) 与 turn(换手率/%) 两列, 供筹码峰使用;
                 成交均价 = amount / volume。老库在导入 DataBase.py 时自动 ALTER 补列,
                 之后跑一次全量日线采集即可回填(约 2~3 小时)。
    v1.0.2 变更: stock_list 恢复为四列(code/name/market/board), 不再采集上市日期与行业;
                 三个采集脚本各自只建自己那张表, 写入改为区间替换(重跑同区间结果不变,
                 且不会删除区间外的历史数据)

    db 文件夹作为数据库, 维护四张表: 股票列表 StockList、基本面表 Fundamentals、日线信息表 DailyQuote、事件表 Event,
    表单模型位于 Models.py 中, 数据通讯接口为 DataBase.py (供 main.py 的 FastAPI 接口调用)

    每个采集脚本只创建自己负责的那张表 (早期版本会把四张表全建进每个库里):
        collect_StockList.py    -> StockList.db     (stock_list)
        collect_DailyQuote.py   -> DateData.db      (daily_quote)
        collect_Fundamentals.py -> Fundamentals.db  (fundamentals)
        add_Events.py           -> Events.db        (events)

    四个库文件均不入 git (.gitignore 忽略 *.db), 但采集脚本随仓库上传, 可运行以获取数据
    脚本支持两种启动方式: 仓库根目录 `python DataBase/collect_X.py`, 或进入 DataBase 目录 `python collect_X.py`


StockList.db    5632 只(含退市)主板、创业板、科创板股票, 由 collect_StockList.py 采集
    board 分布: 主板 3578 / 创业板 1440 / 科创板 614
    字段: code, name, market(SH/SZ), board
    只调用一次全市场代码/名称接口, 全量刷新只需几秒

    不再采集 listed_date(上市日期) 与 industry(所属行业):
        这两项需要逐股请求东财详情接口, 实测该链路不稳定(偶发 RemoteDisconnected / 连接被拒),
        且当前项目并未使用它们。将来若确实需要, 建议改用交易所批量列表接口
        (ak.stock_info_sh_name_code / ak.stock_info_sz_name_code), 三次请求即可拿到全市场上市日期。


DateData.db     上述股票从 2020-01-02 ~ 2026-07-01 的日线级数据, 共 7,470,718 行 / 5419 只
    由 collect_DailyQuote.py 批量采集 (Baostock, 不复权)
    字段: code, date, preclose, open, high, low, close, volume, amount, turn
        amount 成交额(元), turn 换手率(%), 均由 Baostock 同一次请求返回
        成交均价(VWAP) = amount / volume, 筹码峰用它在当日 [low, high] 内定位筹码峰
    单只定向采集用 --code, 断点续采用 --restart

    回填 amount / turn (老库先启动一次后端或采集脚本自动补列, 再执行):
        python DataBase/collect_DailyQuote.py --from 2020-01-01 --to 2026-09-18
        全量约 2~3 小时; 回填前建议先备份 DateData.db


Fundamentals.db 上述股票从 2020-03-31 ~ 2026-06-30 发布的季报信息(年初至今模式), 共 130,596 行 / 5474 只
    由 collect_Fundamentals.py 采集, 包含以下内容
        股票代码: 000001
        日期: 2026-03-31 00:00:00

        总股本: 19405918198.0
        流通股: 19405600653.0

        摊薄每股收益(元): 0.7484
        加权每股收益(元): 0.67
        每股收益_调整后(元): 0.67
        扣除非经常性损益后的每股收益(元): 0.67       注: 扣非数据在一季报和三季报中不强制纰漏, 因此总是出现0的数据, 不宜用来参与计算
        每股净资产_调整前(元): 28.037
        每股净资产_调整后(元): 23.91
        每股经营性现金流(元): 1.948
        每股资本公积金(元): 4.1533
        每股未分配利润(元): 14.62

        总资产(元): 6033962000000.0
        总资产增长率(%): 4.4325
        净资产增长率(%): 7.5025
        扣除非经常性损益后的净利润(元): 14488000000.0
        主营业务利润(元): -397000000.0
        非主营比重: 25.9843
        净利润增长率(%): 3.0292


        资产负债率(%): 90.983
        股东权益比率(%): 9.017
        经营现金净流量与净利润的比率(%): 2.6029
        经营现金净流量对负债比率(%): 0.0069           注: 总股本和流通股本信息并非随企业季报年报纰漏, 为了方便起见,
                                                          按报告日期匹配最近一次股本变更后, 也一并按季报年报时间统计


运行方式(在仓库根目录执行即可。collect_DailyQuote.py 与 collect_Fundamentals.py 都依赖 StockList.db,
若报"读取 StockList.db 失败", 先跑一次 collect_StockList.py):
    uvicorn main:app --reload                                                  # 启动后端服务

    python DataBase/collect_StockList.py                                       # 全量刷新股票列表(几秒)
    python DataBase/collect_StockList.py --code 000001                         # 只刷新单只股票

    python DataBase/collect_DailyQuote.py --from 2026-07-01 --to 2026-09-18    # 增量补日线
    python DataBase/collect_DailyQuote.py --code 000001 --from 2026-07-01 --to 2026-09-18
    python DataBase/collect_DailyQuote.py --from 2020-01-01 --to 2026-09-18    # 全量回填 amount/turn

    python DataBase/collect_Fundamentals.py --from 2026-03-31 --to 2026-09-18  # 增量补季报
    python DataBase/collect_Fundamentals.py --code 000001 --from 2026-03-31 --to 2026-09-18

    python DataBase/add_Events.py                                              # 初始化事件表

    写入策略为"区间替换": 重跑同一区间结果不变, 且不会删除区间外的历史数据。
