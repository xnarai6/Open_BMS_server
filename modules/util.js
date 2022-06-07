// mysql connection info
// const mysqlInfo = {
//     host: '211.254.214.135',
//     port: '8084',
//     user: 'hivvSet',
//     password: 'gkdlqmfoqtpt321',
//     database: 'OPENBMS',
//     waitForConnections: true,
//     connectionLimit: 1000,
//     connectTimeout: 1000,
//     queueLimit: 0,
//     multipleStatements: true
// }

const mysqlInfo = {
    host: '14.63.174.168',
    port: '3306',
    user: 'hivvDev',
    password: 'Psw9UhGb0PnB',
    database: 'OPENBMS',
    waitForConnections: true,
    connectionLimit: 1000,
    connectTimeout: 1000,
    queueLimit: 0,
    multipleStatements: true
}

// error code info
const errorCode = {
    printBufferError: {
        code: '[ER_PB_1]',
        message: ' - This parameter is not buffer'
    }, parsingError: {
        code: '[ER_P_1]',
        message: ' - data parsing error'
    }, parsingDetailError: {
        code: '[ER_P_2]',
        message: ' - data(detail) parsing error'
    }, parsingDbError: {
        code: '[ER_P_3]',
        message: ' - data(db) parsing error'
    }, parsingHourError: {
        code: '[ER_P_4]',
        message: ' - hour parsing error'
    }, parsingDayError: {
        code: '[ER_P_5]',
        message: ' - day parsing error'
    }, parsingMonthError: {
        code: '[ER_P_6]',
        message: ' - month parsing error'
    }, parsingMngError: {
        code: '[ER_P_6]',
        message: ' - mng parsing error'
    }, querySelectFormatError: {
        code: '[ER_QS_1]',
        message: ' - format select is invalid'
    }, querySelectFormatEmpty: {
        code: '[ER_QS_2]',
        message: ' - format select result is empty'
    }, querySelectMngError: {
        code: '[ER_QS_3]',
        message: ' - mng select is invalid'
    }, querySelectMngEmpty: {
        code: '[ER_QS_4]',
        message: ' - mng select result is empty'
    }, querySelectHourError: {
        code: '[ER_QS_5]',
        message: ' - hour select is invalid'
    }, querySelectHourEmpty: {
        code: '[ER_QS_6]',
        message: ' - hour select result is empty'
    }, querySelectDayError: {
        code: '[ER_QS_7]',
        message: ' - day select is invalid'
    }, querySelectDayEmpty: {
        code: '[ER_QS_8]',
        message: ' - day select result is empty'
    }, querySelectMonthError: {
        code: '[ER_QS_9]',
        message: ' - month select is invalid'
    }, querySelectMonthEmpty: {
        code: '[ER_QS_10]',
        message: ' - month select result is empty'
    }, queryInsertRcvError: {
        code: '[ER_QI_1]',
        message: ' - rcv insert is invalid'
    }, queryInsertRcvDataError: {
        code: '[ER_QI_2]',
        message: ' - rcv data insert is invalid'
    }, queryInsertHourError: {
        code: '[ER_QI_3]',
        message: ' - hour insert is invalid'
    }, queryInsertDayError: {
        code: '[ER_QI_4]',
        message: ' - day insert is invalid'
    }, queryInsertMonthError: {
        code: '[ER_QI_5]',
        message: ' - month insert is invalid'
    }, queryInsertMngError: {
        code: '[ER_QI_6]',
        message: ' - mng insert is invalid'
    }, protocolValueError: {
        code: '[ER_PV_1]',
        message: ' - protocol value is invalid'
    }, schedulerDateTimeError: {
        code: '[ER_SDT_1]',
        message: ' - scheduler datetime is invalid'
    }
}

const cmdInfo = {
    main: {
        minHex: 0x0BA0, maxHex: 0x0BA2,
        TH: { db: 'TH', cmd: '0BA0' },
        VC: { db: 'VC', cmd: '0BA1' },
        LOC: { db: 'LOC', cmd: '0BA2' }
    }, biz: {
        minHex: 0x0CA0, maxHex: 0x0CA1,
        IBT: { db: 'IBT', cmd: '0CA0' },
        TS: { db: 'TS', cmd: '0CA1' }
    }
}

// error print
function errorPrint(error1, error2) {
    console.log(error1);
    if(error2) console.log(error2);
    return false;
}

// make key
function makeKeySet(now) {
    return {
        key: now.format('YYYYMMDDHHmmss') + now.milliseconds().toString().padStart(3, '0'),
        dt: now.format('YYYYMMDD'),
        h: now.format('HH'),
        m: now.format('mm'),
        dttm: now.format('YYYY-MM-DD HH:mm:ss'),
    }
}

// buffer to hex
function bufferOneLine(buffer) {
    let result = '';
    
    if(!Buffer.isBuffer(buffer)) return errorCode.printBufferError;

    buffer.forEach((v, i) => {
        result += v.toString(16).padStart(2, '0');
        if (i != buffer.length - 1) result += ' ';
    });

    return result;
}

// print wrapper
function wrapperPrint(wrap, data) {
    console.log('========== ' + wrap + ' START ==========');
    console.log(data);
    console.log('========== ' + wrap + ' END ==========');
}

// hex range check
function hexRangeCheck(hex, minHex, maxHex) {
    const val = transferHex(hex), minVal = transferHex(minHex), maxVal = transferHex(maxHex);
    if (val >= minVal && val <= maxVal) return true;
    return false;
}

// transfer hex
function transferHex(hex) {
    return typeof hex == 'number' ? hex : parseInt(hex, 16);
}

module.exports = {
    mysqlInfo: mysqlInfo,
    errorCode: errorCode,
    cmdInfo: cmdInfo,
    errorPrint: errorPrint,
    makeKeySet: makeKeySet,
    bufferOneLine: bufferOneLine,
    wrapperPrint: wrapperPrint,
    hexRangeCheck: hexRangeCheck,
    transferHex: transferHex
}