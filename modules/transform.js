// resolve basic protocol
function basicProtocol(buff) {
    return {
        STX: buff.toString('hex', 0, 1),
        SOH: buff.toString('hex', 1, 2),
        LEN: buff.readIntBE(2, 2),
        CMD: buff.toString('hex', 4, 6).toUpperCase(),
        BOARDNUM: buff.toString('hex', 6, 30),
        DATA: buff.slice(30, buff.length - 2),
        CRC: buff.readIntBE(buff.length - 2, 1),
        ETX: buff.toString('hex', buff.length - 1, buff.length)
    }
}

// resolve main database protocol
function mainDbProtocol(formatInfo, mainInfo, keySet, basicObject) {
    const cmpySeq = formatInfo.cmpy_seq, btrySeq = formatInfo.btry_seq;
    const cmd = basicObject.CMD, data = basicObject.DATA;

    let result = {
        db: '',
        param: {
            cmpy_seq: cmpySeq, btry_seq: btrySeq,
            brd_num: basicObject.BOARDNUM,
            mn_key: keySet.key, mn_dt: keySet.dt, mn_h: keySet.h, mn_m: keySet.m,
            mn_inp_cd: 'B', mn_stat_cd: 'Y',
            cmd: cmd, len: basicObject.LEN, crc: basicObject.CRC,
            ins_nm: 'socket', ins_dttm: keySet.dttm
        }
    }

    // 온습도
    if (cmd == mainInfo['TH'].cmd) {
        result['db'] = mainInfo['TH'].db;
        Object.assign(result['param'], {
            tp1: (data.readIntLE(0, 2) / 100).toFixed(2), 
            hd1: (data.readIntLE(2, 2) / 100).toFixed(2),
            tp2: (data.readIntLE(4, 2) / 100).toFixed(2), 
            hd2: (data.readIntLE(6, 2) / 100).toFixed(2),
        });
    }
    
    // 전압전류
    if (cmd == mainInfo['VC'].cmd) {
        result['db'] = mainInfo['VC'].db;
        Object.assign(result['param'], {
            volt: (data.readIntLE(0, 4) / 1000).toFixed(2),
            curr: (data.readIntLE(4, 4) / 1000).toFixed(2),
        });
    }
    
    // 위치
    if (cmd == mainInfo['LOC'].cmd) {
        result['db'] = mainInfo['LOC'].db;
        Object.assign(result['param'], {
            lat: data.readIntLE(0, 1) + '.' + data.readUIntLE(1, 4).toString().padStart(7, '0'),
            lon: data.readIntLE(5, 1) + '.' + data.readUIntLE(6, 4).toString().padStart(7, '0'),
        });
    }

    return result;
}

// prev protocol
function prevProtocol(formatJson, basicData) {
    const format = JSON.parse(formatJson);
    const stx = format.STX, etx = format.ETX;
    const protocolInfo = format.protocolInfo, changeInfo = format.changeInfo;

    let result = {
        type: protocolInfo.type,
        protocol: protocolInfo.val,
        data: []
    }

    if (protocolInfo != null) {
        let offset = 0, changeData = [], start = 0, end = 0;

        while (start != -1 && end != -1) {
            start = basicData.indexOf(stx, offset, 'hex') + 1;
            end = basicData.indexOf(etx, offset, 'hex');

            if (start == -1 || end == -1) break;

            let tData = basicData.slice(start, end);

            if (changeInfo != null && changeInfo.type == 'C') tData = tData.map(e => e = eval(e + ' ' + changeInfo.val[0].unit + ' ' + parseInt(changeInfo.val[0].cal, 16)));
            if (changeInfo != null && changeInfo.type == 'M') {
                let tStr = tData.toString('hex').toUpperCase();
                for (let e of changeInfo.val) tStr = tStr.replace(new RegExp(e.from, 'gi'), e.to);
                tData = Buffer.from(tStr, 'hex');
            }
            if (changeInfo != null && changeInfo.type == 'E') {
                let tStr = tData.toString('utf-8'), rStr = '';
                tStr.split('').map(e => rStr += '0' + e);
                tData = Buffer.from(rStr, 'hex');
            }

            changeData.push(tData);

            offset = end + 1;
        }

        result.data = changeData;
    }

    return result;
}

// resolve biz protocol
// function bizProtocol(formatJson, prevDataObject) {
//     return bizIBTProtocol(formatJson, prevDataObject);
// }

// resolve biz(IBT) protocol
function bizProtocol(formatJson, prevDataObject) {
    const format = JSON.parse(formatJson);

    const mpInfo = format.MP, dataFormat = format.data;

    let protocolType = prevDataObject.type;
    const protocolArray = prevDataObject.protocol, dataArray = prevDataObject.data;

    let result = { }

    for (let d of dataArray) {
        let gubun;
        if (mpInfo.byteType == 'SV') gubun = mpInfo.byte;
        if (mpInfo.byteType == 'BR') {
            gubun = d.slice(mpInfo.byte[0], mpInfo.byte[1] + 1).slice(0, 2).reverse().toString('hex');

            d = d.slice(mpInfo.byte[1] + 1, d.length);
        }

        let protocolElement = protocolArray.find(e => e.code == gubun);
        if (protocolElement == undefined) continue;

        let name = protocolElement.name, realFormat = dataFormat[name];

        let start = 0;

        for (let key in realFormat) {
            let count = 1
            const byte = realFormat[key].byte;
            const reverseType = realFormat[key].reverseType;
            const arrayType = realFormat[key].arrayType, returnType = realFormat[key].returnType, calType = realFormat[key].calType;
            const arrayTarget = realFormat[key].arrayTarget, calUnit = realFormat[key].calUnit, calVal = realFormat[key].calVal;
    
            if (arrayType != 'NA') result[key] = [];
            if (arrayType == 'AN') count = parseInt(arrayTarget);
            if (arrayType == 'AT') count = parseInt(result[arrayTarget], 16);
    
            for(let i = 0; i < count; i++) {
                let end = start + byte, value;

                let tempD = d.slice(start, end);
                if (reverseType == 'R') tempD = tempD.reverse();

                if (returnType == 'S') value = tempD;
                else if (returnType == 'H') value = tempD.toString('hex');
                else if (returnType == 'N') value = parseInt(tempD.toString('hex'), 16);
                else if (returnType == 'SN') {
                    value = parseInt(tempD.toString('hex'), 16);
                    let intMask = parseInt(('0x80' + '00'.repeat(byte - 1)), 16);
                    if ((value & intMask) > 0) value = value - intMask * 2;
                }
                else if (returnType == 'U') value = tempD.toString();
                else if (returnType == 'A') value = tempD.toString('ascii');
                else if (returnType == 'IH') value = tempD.reduce((s, v) => s + v.toString(16).toUpperCase(), '');
                else if (returnType == 'IHN') value = parseInt(tempD.reduce((s, v) => s + v.toString(16).toUpperCase(), ''), 16);
    
                // console.log(key, '|', returnType, '|', tempD, '|', value);
    
                if (calType == 'Y') value = eval(value + ' ' + calUnit + ' ' + calVal);
    
                if (arrayType == 'NA') result[key] = value;
                else result[key].push(value);
    
                start = end;
            }
        }
    }

    return result;
}

function bizDbObject(formatInfo, keySet, basicObject, bizObject) {
    const cmpySeq = formatInfo.cmpy_seq, btrySeq = formatInfo.btry_seq;
    const format = JSON.parse(formatInfo.db_fmt_json);

    let result = [];

    let count = 1;
    if (format['LOOP'].loopType == 'N') count = Number(format['LOOP'].target);
    if (format['LOOP'].loopType == 'T') count = Number(bizObject[format['LOOP'].target]);
    if (format['LOOP'].loopType == 'MT') count = Number(format['LOOP'].target.reduce((ac, cv) => ac + (bizObject[cv] ? bizObject[cv].length : 0), 0));
    if (count <= 0) count = 1;

    for (let i = 0; i < count; i++) {
        let tempResult = {
            brd_num: basicObject.BOARDNUM, 
            biz_key: keySet.key, biz_dt: keySet.dt, biz_h: keySet.h, biz_m: keySet.m,
            cmpy_seq: cmpySeq, btry_seq: btrySeq,
            ins_nm: 'socket', ins_dttm: keySet.dttm
        }

        for (let key in format) {
            let value, targetCount = 1;
            const multiType = format[key].multiType, multiCalUnit = format[key].multiCalUnit;
            const changeType = format[key].changeType, changeJson = format[key].changeJson;

            if (multiType == 'M' || multiType == 'MC') targetCount = format[key].target.length;

            if (multiType == 'O') {
                let tempValue;
                const arrayType = format[key].arrayType;
                const target = format[key].target, targetValue = bizObject[target];
                if (targetValue == undefined) continue;

                if (arrayType == 'NA') tempValue = targetValue;
                if (arrayType != 'NA') {
                    const arrayCal = format[key].arrayCal, arrayIdx = format[key].arrayIdx;

                    if (arrayType == 'AI') tempValue = targetValue[i];
                    if (arrayType == 'AC' && arrayCal == 'S') tempValue = targetValue.reduce((total, cur) => total + cur, 0);
                    if (arrayType == 'AC' && arrayCal == 'A') tempValue = targetValue.reduce((total, cur) => total + cur, 0) / targetValue.length || 0;
                    if (arrayType == 'AO') tempValue = targetValue[arrayIdx];
                }

                value = tempValue;
            }

            if (multiType == 'M') {
                for (let targetIndex = 0; targetIndex < targetCount; targetIndex++) {
                    let tempValue;
                    const arrayType = format[key].arrayType[targetIndex];
                    const target = format[key].target[targetIndex], targetValue = bizObject[target];
                    if (targetValue == undefined) continue;
    
                    if (arrayType == 'NA') tempValue = targetValue;
                    if (arrayType != 'NA') {
                        const arrayCal = format[key].arrayCal, arrayIdx = format[key].arrayIdx;
    
                        if (arrayType == 'AI') tempValue = targetValue[i];
                        if (arrayType == 'AC' && arrayCal == 'S') tempValue = targetValue.reduce((total, cur) => total + cur, 0);
                        if (arrayType == 'AC' && arrayCal == 'A') tempValue = targetValue.reduce((total, cur) => total + cur, 0) / targetValue.length || 0;
                        if (arrayType == 'AO') tempValue = targetValue[arrayIdx];
                    }
    
                    if (targetIndex == 0) value = tempValue;
                    else if (targetIndex != 0) value = eval(value + ' ' + multiCalUnit + ' ' + tempValue);
                }
            }

            if (multiType == 'MC') {
                let targetArray = [];

                for (let targetIndex = 0; targetIndex < targetCount; targetIndex++) {
                    const arrayType = format[key].arrayType[targetIndex];
                    const target = format[key].target[targetIndex], targetValue = bizObject[target];
                    if (targetValue == undefined) continue;

                    if (arrayType == 'NA') targetArray.push(targetValue);
                    if (arrayType != 'NA') {
                        const arrayCal = format[key].arrayCal, arrayIdx = format[key].arrayIdx;
    
                        if (arrayType == 'AI') targetArray = targetArray.concat(targetValue);
                        if (arrayType == 'AC' && arrayCal == 'S') targetArray = targetArray.push(targetValue.reduce((total, cur) => total + cur, 0));
                        if (arrayType == 'AC' && arrayCal == 'A') targetArray = targetArray.push(targetValue.reduce((total, cur) => total + cur, 0) / targetValue.length || 0);
                        if (arrayType == 'AO') targetArray = targetArray.push(targetValue[arrayIdx]);
                    }
                }

                if (targetArray.length == 0) continue;

                value = targetArray[i];
            }

            if (changeType != 'NC') {
                const changeObject = JSON.parse(changeJson);

                if (changeType == 'CN') {
                    if (value < 0) value = changeObject['-'];
                    if (value > 0) value = changeObject['+'];
                    if (value == 0) value = changeObject['0'];
                }
                
                if (changeType == 'CS') value = changeObject[value];
            }

            if (format[key].saveType == 'NS') continue;
            else tempResult[key] = value;
        }

        result.push(tempResult);
    }

    return result;
}

function bizDbArray(bizCmd, bizDbObject) {
    return [
        bizDbObject.map(obj => [
            obj.brd_num, obj.biz_key, obj.biz_dt, obj.biz_h, obj.biz_m,
            obj.cmpy_seq, obj.btry_seq, bizCmd, obj.cmd,
            obj.len, obj.alarm_stat, obj.fet_stat,
            obj.volt_sys, obj.volt_mdl, obj.volt_etc1, obj.curr_sys, obj.curr_mdl,
            obj.curr_etc1, obj.tp_sys, obj.tp_mdl, obj.tp_etc1, obj.chrg_stat_cd,
            obj.soc, obj.soh, obj.crc, obj.ins_nm, obj.ins_dttm 
        ])
    ];
}

function bizRawObject(formatInfo, boardNum, keySet, basicObjectData) {
    return {
        brd_num: boardNum,
        biz_key: keySet.key, biz_dt: keySet.dt, biz_h: keySet.h, biz_m: keySet.m,
        cmpy_seq: formatInfo.cmpy_seq, btry_seq: formatInfo.btry_seq,
        raw: basicObjectData.toString('hex').toUpperCase(),
        ins_nm: 'socket', ins_dttm: keySet.dttm,
    }
}

function hourDbObject(dt, h, nowDttm, dataRow) {
    let result = [];

    for (let data of dataRow) {
        let temp = {
            cmpy_seq: data.cmpy_seq, btry_seq: data.btry_seq,
            sttc_dt: dt, sttc_hour: h,
            comment: '',
            avg_chrg_time: data['C'], avg_dischrg_time: data['DC'], avg_standby_time: data['W'],
            chrg_cnt: data['C_cnt'],
            volt_max: data.volt_max, volt_min: data.volt_min,
            curr_max: data.curr_max, curr_min: data.curr_min,
            tp_max: data.tp_max, tp_min: data.tp_min,
            avg_soc: data.soc, avg_soh: data.soh,
            ins_nm: 'socket', ins_dttm: nowDttm,
        }

        result.push(temp);
    }

    return result;
}

function hourDbArray(hourDbObject) {
    return [
        hourDbObject.map(obj => [
            obj.cmpy_seq, obj.btry_seq,
            obj.sttc_dt, obj.sttc_hour,
            obj.comment,
            obj.avg_chrg_time, obj.avg_dischrg_time, obj.avg_standby_time, 
            obj.chrg_cnt,
            obj.volt_max, obj.volt_min,
            obj.curr_max, obj.curr_min,
            obj.tp_max, obj.tp_min,
            obj.avg_soc, obj.avg_soh, 
            obj.ins_nm, obj.ins_dttm
        ])
    ];
}

function dayDbObject(dt, wd, nowDttm, dataRow) {
    let result = [];

    for (let data of dataRow) {
        let temp = {
            cmpy_seq: data.cmpy_seq, btry_seq: data.btry_seq,
            sttc_dt: dt, sttc_dayweek: wd,
            comment: '',
            avg_chrg_time: data['C'], avg_dischrg_time: data['DC'], avg_standby_time: data['W'],
            chrg_cnt: data['C_cnt'], chk_cnt: data['chk_cnt'], event_cnt: data['event_cnt'],
            max_volt: data.max_volt, min_volt: data.min_volt,
            max_curr: data.max_curr, min_curr: data.min_curr,
            max_tp: data.max_tp, min_tp: data.min_tp,
            avg_soc: data.soc, avg_soh: data.soh,
            ins_nm: 'socket', ins_dttm: nowDttm,
        }

        result.push(temp);
    }

    return result;
}

function dayDbArray(dayDbObject) {
    return [
        dayDbObject.map(obj => [
            obj.cmpy_seq, obj.btry_seq,
            obj.sttc_dt, obj.sttc_dayweek,
            obj.comment,
            obj.avg_chrg_time, obj.avg_dischrg_time, obj.avg_standby_time,
            obj.chrg_cnt, obj.chk_cnt, obj.event_cnt, 
            obj.max_volt, obj.min_volt,
            obj.max_curr, obj.min_curr,
            obj.max_tp, obj.min_tp,
            obj.avg_soc, obj.avg_soh, 
            obj.ins_nm, obj.ins_dttm
        ])
    ];
}

function monthDbObject(date, month, nowDttm, dataRow) {
    let result = [];

    for (let data of dataRow) {
        let temp = {
            cmpy_seq: data.cmpy_seq, btry_seq: data.btry_seq,
            sttc_dt: date, sttc_month: month,
            comment: '',
            avg_chrg_time: data['C'], avg_dischrg_time: data['DC'], avg_standby_time: data['W'],
            chrg_cnt: data['C_cnt'], chk_cnt: data['chk_cnt'], event_cnt: data['event_cnt'],
            max_volt: data.max_volt, min_volt: data.min_volt,
            max_curr: data.max_curr, min_curr: data.min_curr,
            max_tp: data.max_tp, min_tp: data.min_tp,
            avg_soc: data.soc, avg_soh: data.soh,
            ins_nm: 'socket', ins_dttm: nowDttm,
        }

        result.push(temp);
    }

    return result;
}

function monthDbArray(monthDbObject) {
    return [
        monthDbObject.map(obj => [
            obj.cmpy_seq, obj.btry_seq,
            obj.sttc_dt, obj.sttc_month,
            obj.comment,
            obj.avg_chrg_time, obj.avg_dischrg_time, obj.avg_standby_time,
            obj.chrg_cnt, obj.chk_cnt, obj.event_cnt,
            obj.max_volt, obj.min_volt,
            obj.max_curr, obj.min_curr,
            obj.max_tp, obj.min_tp,
            obj.avg_soc, obj.avg_soh,
            obj.ins_nm, obj.ins_dttm
        ])
    ];
}

function mngDbObject(type, dt, val, nowDttm) {
    let result = {
        sttc_ty_cd: type,
        last_sttc_dt: dt, last_sttc_val: val,
        ins_nm: 'socket', ins_dttm: nowDttm
    }

    return result;
}


function lastDbObject(type, prevObject, keySet) {
    let result;

    if (type == 'LOC') {
        result = [
            prevObject.btry_seq, keySet.dttm, 
            prevObject.lat, prevObject.lon,
            'socket', keySet.dttm, 'socket', keySet.dttm
        ];
    }

    if (type == 'TH') {
        result = [
            prevObject.btry_seq, keySet.dttm, 
            prevObject.tp1, prevObject.hd1,
            'socket', keySet.dttm, 'socket', keySet.dttm
        ];
    }

    if (type == 'VC') {
        result = [
            prevObject.btry_seq, keySet.dttm, 
            prevObject.volt, prevObject.curr,
            'socket', keySet.dttm, 'socket', keySet.dttm
        ];
    }

    if (type == 'BIZ') {
        result = [
            prevObject.btry_seq, keySet.dttm,
            prevObject.chrg_stat_cd, prevObject.volt_sys, prevObject.curr_sys, prevObject.tp_sys, prevObject.soc, prevObject.soh,
            'socket', keySet.dttm, 'socket', keySet.dttm
        ];
    }

    return result;
}

module.exports = {
    resolve: {
        prevProtocol: prevProtocol,
        basicProtocol: basicProtocol,
        mainDbProtocol: mainDbProtocol,
        bizProtocol: bizProtocol,
    }, make: {
        bizDbObject: bizDbObject,
        bizDbArray: bizDbArray,
        bizRawObject: bizRawObject,
        lastDbObject: lastDbObject
    }, sch: {
        hourDbObject: hourDbObject,
        hourDbArray: hourDbArray,
        dayDbObject: dayDbObject,
        dayDbArray: dayDbArray,
        monthDbObject: monthDbObject,
        monthDbArray: monthDbArray,
        mngDbObject: mngDbObject
    }
}