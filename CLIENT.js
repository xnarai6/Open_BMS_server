const net = require('net');
const socket = new net.Socket();
const util = require('./modules/util.js');
const makedata = require('./modules/makedata.js');
const serverInfo = { host: '127.0.0.1', port: '4000' }
const brdNumArray = [
    'dc52b0d82ad17a29b5e86f5d7adb4cdce837c78d851b1806',
    'bf7cca40351cb7aa1df160d7fd871b958001a21cc1d9c9bd',
    'dda3a219c77d590fc78ec94432ad8bf30a1f32d545903b25',
    'eaf007ddc9fc5a358afa49c980fcf14ef58feec180fff3b1',
    'cb71125203485456c4d7cd7dc55e13e82432d2c091b4ce3c',
    '43384f7523bfcf1ea185553ffec94ab064929185d5b62d13',
    '1fc30a8a7571b1b9db1996ce8ec81a186bc71b2e1a0a02c1',
    '681fa145e9494efe756a31d41e192c73e0fcd6e817897250',
    '4f481662a159d5617fd2412b98c39edbdd582c3abd4894b8',
    '6bdc6d65f2e205b34be20df0e715cd929758fae3b1b74583',
];

socket.connect(serverInfo, () => {
    console.log('========== CONNECT ==========');

    // const sendType = makedata.CMDType.Loc;
    const sendType = makedata.CMDType.Ts;
    // const boardNum = '8c55d483a26805036fa9b8e6b8f647b9271cd01e92f4fa72';
    const boardNum = brdNumArray[getRandomInt(0, brdNumArray.length)];

    const head = makedata.head(sendType, boardNum);
    // const data = makedata.data.main(sendType);
    const data = makedata.data.biz(sendType);
    const tail = makedata.tail();

    const sendBuffer = Buffer.concat([head, data, tail]);

    console.log('========== SEND DATA START ==========');
    console.log(util.bufferOneLine(sendBuffer));
    console.log('========== SEND DATA END ==========');

    socket.write(sendBuffer);

    socket.end();
});

socket.on('data', (data) => { console.log('FROM SERVER RESPONSE IS: ' + data); });
socket.on('end', () => { console.log('========== END =========='); });


function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min)) + min; }