# HourGlass
A practice assistant for stock trading in the A-share market

## 关于版本
    应用版本
        自v0.0(.0)起始
        第一位代表大版本, 第二位代表重大改动, 第三位代表小改动
    数据库版本
        自v1.0(.0)起始, 早先版本已经丢失
        数据库文件不会同步至github, 但生成文件有上传, 可运行以获取数据
        数据库详细说明参阅/DataBase/README.md


## 关于命名
    文件名
        诸如 collect_StockList.py 的采集脚本, 以 collect_ 开头, 之所以有下划线是因为在Models.py中有同名类 StockList
        否则, 像以一套流程或一个函数为主题的文件, 以小写字母开头, 以驼峰式命名, 例如 dataLoader.js, 不会出现下划线
