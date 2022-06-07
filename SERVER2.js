const net = require('net');
const mysql = require('mysql2/promise');
const asyncRedis = require("async-redis");
const moment = require('moment');
const util = require('./modules/util.js');
const query = require('./modules/query.js');
const format = require('./modules/format.js');
const transform = require('./modules/transform.js');

// const redisClient = asyncRedis.createClient();

const port = 4000;
const pool = mysql.createPool(util.mysqlInfo);
const errorCode = util.errorCode;

// server.on('connection', (socket) => { console.log('SERVER CONNECT | ' + moment().format('YYYY-MM-DD HH:mm:ss')); });
const server = net.createServer((socket) => {
    console.log('SERVER CONNECT | ' + moment().format('YYYY-MM-DD HH:mm:ss'));

    // 30min timeout
    socket.setTimeout(1800000);

    socket.on('timeout', () => { console.log('TIMEOUT | ' + moment().format('YYYY-MM-DD HH:mm:ss')); socket.end(); });
    socket.on('error', (err) => { console.log('ERROR | ' + moment().format('YYYY-MM-DD HH:mm:ss')); console.log(err); socket.end(); });
    socket.on('end', () => { console.log('END | ' + moment().format('YYYY-MM-DD HH:mm:ss')); });
    socket.on('close', () => { console.log('CLOSE | ' + moment().format('YYYY-MM-DD HH:mm:ss')); });

    socket.on('data', async (data) => {
        console.log('SEND ADDRESS | ' + JSON.stringify(socket.address()));

        console.log('DATA | ' + socket.remoteAddress + ' | ' + moment().format('YYYY-MM-DD HH:mm:ss'));
        console.log('========== START(' + moment().format('YYYY-MM-DD HH:mm:ss') + ') ==========');

        // key value setting
        let keySet = util.makeKeySet(moment());

        // cmdInfo setting
        const mainInfo = util.cmdInfo['main'], bizInfo = util.cmdInfo['biz'];

        // data print
        util.wrapperPrint('1-1. BASIC DATA', util.bufferOneLine(data));

        // 1-1. protocol 분리
        let basicObject, basicObjectData;
        try { basicObject = transform.resolve.basicProtocol(data); }
        catch (error) { return util.errorPrint(errorCode.parsingError, error); }
        basicObjectData = basicObject.DATA;

        // 1-2. protocol 및 data print
        util.wrapperPrint('1-2. BASIC OBJECT', basicObject);
        util.wrapperPrint('2-1. DETAIL DATA', util.bufferOneLine(basicObject.DATA));

        // 1-2. STX / SOH / ETX 가 안맞는 경우
        if (basicObject.STX != '02' || basicObject.SOH != '01' || basicObject.ETX != '03') return util.errorPrint(errorCode.protocolValueError);

        // db connection
        const connection = await pool.getConnection(async conn => conn);
        await connection.beginTransaction();

        // 2. format 가져오기
        let queryResult1, rows1;
        try {
            queryResult1 = await connection.query(query.selectFormat(basicObject.BOARDNUM));
        } catch (error) {
            connection.release();
            return util.errorPrint(errorCode.querySelectFormatError, error);
        }
        if (queryResult1 == null || queryResult1[0].length == 0) {
            connection.release();
            return util.errorPrint(errorCode.querySelectFormatEmpty); 
        }
        rows1 = queryResult1[0];

        // 5. format 셋팅
        const formatInfo = rows1[0];
        // formatInfo.ptc_fmt_json = JSON.stringify(format.protocolFormat);
        // formatInfo.db_fmt_json = JSON.stringify(format.dbFormat);

        formatInfo.prev_fmt_json = JSON.stringify(format.prevFormat);
        formatInfo.ptc_fmt_json = JSON.stringify(format.protocolFormat);
        formatInfo.db_fmt_json = JSON.stringify(format.dbFormat);

        // 3-1. main data인 경우(cmd: 0BA0 ~ 0BA2)
        if (util.hexRangeCheck(basicObject.CMD, mainInfo.minHex, mainInfo.maxHex)) {
            console.log('========== 2-2-1. MAIN DATA START ==========');

            // 4. 메인 object 가져오기
            let mainDbObject;
            try { mainDbObject = transform.resolve.mainDbProtocol(formatInfo, mainInfo, keySet, basicObject); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingError, error);
            }

            console.log(mainDbObject);

            // 5. PTC_MN에 데이터 저장
            try {
                await connection.query(query.insertMain(mainDbObject.db), mainDbObject.param);
                // await redisClient.set("ptcMn:" + basicObject.BOARDNUM + ":" + keySet.key, JSON.stringify(mainDbObject));
            } catch (error) {
                await connection.rollback();
                connection.release();
                return util.errorPrint(errorCode.queryInsertRcvError, error);
            }

            // 6. LAST에 저장할 object 생성
            let lastDbObject;
            try { lastDbObject = transform.make.lastDbObject(mainDbObject.db, mainDbObject.param, keySet); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingError, error);
            }

            // 7. LAST에 저장
            try {
                await connection.query(query.insertLastStat(mainDbObject.db), lastDbObject);
            } catch (error) {
                await connection.rollback();
                connection.release();
                return util.errorPrint(errorCode.queryInsertRcvError, error);
            }

            console.log('========== 2-2-1. MAIN DATA END ==========');
        }

        // 3-2. biz data인 경우(cmd: 0CA0 ~ 0CA1)
        if (util.hexRangeCheck(basicObject.CMD, bizInfo.minHex, bizInfo.maxHex)) {
            console.log('========== 2-2-2. BIZ DATA START ==========');

            // 6. prev 적용
            let prevDataObject;
            try { prevDataObject = transform.resolve.prevProtocol(formatInfo.prev_fmt_json, basicObject.DATA); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingDetailError, error);
            }
            util.wrapperPrint('PREV DATA OBJECT', prevDataObject);

            // 7. 업체 데이터 resolve
            let bizDataObject;
            try { bizDataObject = transform.resolve.bizProtocol(formatInfo.ptc_fmt_json, prevDataObject); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingDetailError, error);
            }
            util.wrapperPrint('BIZ DATA OBJECT', bizDataObject);

            // 8. 업체 db 데이터 make
            let bizDbObject;
            try { bizDbObject = transform.make.bizDbObject(formatInfo, keySet, basicObject, bizDataObject); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingDbError, error);
            }
            // util.wrapperPrint('BIZ DB OBJECT', bizDbObject);

            // 8. 업체 db 데이터 array make
            let bizDbArray;
            try { bizDbArray = transform.make.bizDbArray(basicObject.CMD, bizDbObject); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingDbError, error); 
            }
            // util.wrapperPrint('BIZ DB ARRAY', bizDbArray);

            // 8. 저장1
            try {
                await connection.query(query.insertBiz(), bizDbArray);
                // await redisClient.set("ptcBizData:" + basicObject.BOARDNUM + ":" + keySet.key, JSON.stringify(bizDbObject));
            } catch (error) {
                await connection.rollback();
                connection.release();
                return util.errorPrint(errorCode.queryInsertRcvDataError, error);
            }

            // 9. 저장2(전문 그대로 저장)
            let bizRawObject;
            try { bizRawObject = transform.make.bizRawObject(formatInfo, basicObject.BOARDNUM, keySet, basicObjectData); }
            catch (error) { 
                connection.release();
                return util.errorPrint(errorCode.parsingDbError, error); 
            }
            util.wrapperPrint('BIZ RAW OBJECT', bizRawObject);

            // 10. 저장2(전문 그대로 저장)
            try {
                await connection.query(query.insertBizRaw(), bizRawObject);
                // await redisClient.set("ptcBizData:" + basicObject.BOARDNUM + ":" + keySet.key, JSON.stringify(bizDbObject));
            } catch (error) {
                await connection.rollback();
                connection.release();
                return util.errorPrint(errorCode.queryInsertRcvDataError, error);
            }

            // 11. LAST에 저장할 object 생성
            let lastDbObject;
            try { lastDbObject = transform.make.lastDbObject('BIZ', bizDbObject[bizDbObject.length - 1], keySet); }
            catch (error) {
                connection.release();
                return util.errorPrint(errorCode.parsingError, error);
            }

            // 12. LAST에 저장
            try {
                await connection.query(query.insertLastStat('BIZ'), lastDbObject);
            } catch (error) {
                await connection.rollback();
                connection.release();
                return util.errorPrint(errorCode.queryInsertRcvError, error);
            }

            console.log('========== 2-2-2. BIZ DATA END ==========');
        }

        await connection.commit();
        connection.release();

        console.log('========== END(' + moment().format('YYYY-MM-DD HH:mm:ss') + ') ==========\n');
    });
});

server.on('error', (err) => { console.log('SERVER ERROR | ' + moment().format('YYYY-MM-DD HH:mm:ss')); console.log(err); });
server.on('end', () => { console.log('SERVER END | ' + moment().format('YYYY-MM-DD HH:mm:ss')); });
server.on('close', () => { console.log('SERVER CLOSE | ' + moment().format('YYYY-MM-DD HH:mm:ss')); });
server.listen(port, () => { console.log('This Socket-Server Listen ' + port + ' Port'); });