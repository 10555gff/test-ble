console.log("hello world~!");


var _gatt;
var _service;
var _deviceName;
var _chrct_cube;
var UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
var SERVICE_UUID = '0000fff0' + UUID_SUFFIX;
var CHRCT_UUID_CUBE = '0000fff6' + UUID_SUFFIX;

let aesEcb;

var QIYI_CIC_LIST = [0x0504];

var decoder = null;
var deviceMac = 'CC:A3:00:00:D2:D3';
var KEYS = ['NoDg7ANAjGkEwBYCc0xQnADAVgkzGAzHNAGyRTanQi5QIFyHrjQMQgsC6QA'];

// js/test.js
document.addEventListener('DOMContentLoaded', () => {
  clear();
  const btn = document.getElementById('connect');

  btn.addEventListener('click', async () => {



    try {


      // 1. 请求 BLE 设备
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID] // 这里加上你要访问的所有 service UUID
      });
      console.log('设备:', device.name);

      // 2. 连接 GATT 服务
      const server = await device.gatt.connect();
      console.log('已连接 GATT Server');


      // 3. 获取 Battery Service
      const service = await server.getPrimaryService(SERVICE_UUID);
      console.log('service:\n',service);

      // 4. 获取 Characteristic
      const characteristic  = await service.getCharacteristic(CHRCT_UUID_CUBE);
      console.log('Characteristic:\n', characteristic);





      // 5. 订阅数据通知
      _chrct_cube=await characteristic.startNotifications();
      _chrct_cube.addEventListener('characteristicvaluechanged', onCubeEvent);
      console.log('已订阅数据通知 ✅');

      deviceMac = 'CC:A3:00:00:D2:D3';
      await sendHello(deviceMac);

    } catch (error) {
      console.error(error);
    }
  });
});

  // 🔹 数据处理函数
  function onCubeEvent(event) {
    const value = event.target.value;
	//得到加密数据
    const encMsg = new Uint8Array(value.buffer);

    // 初始化 AES-128 解密器
    if (!decoder) {
      const key = JSON.parse(LZString.decompressFromEncodedURIComponent(KEYS[0]));// 假设 KEYS[0] 是压缩的密钥字符串，需解压为 16 字节数组
      decoder = $.aes128(key); // 创建 AES-128 实例
    }

	//解密msg
    var msg = [];
	for (var i = 0; i < encMsg.length; i += 16) {
		var block = encMsg.slice(i, i + 16);
		decoder.decrypt(block);
		for (var j = 0; j < 16; j++) {
			msg[i + j] = block[j];
		}
	}
	console.log('[qiyicube] decrypted msg', msg);

	//处理解密后魔方状态的数据，
	parseCubeData(msg);
  }


  function sendHello(mac) {
    if (!mac) {
      return Promise.reject('empty mac');
    }
    var content = [0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00];
    for (var i = 5; i >= 0; i--) {
      content.push(parseInt(mac.slice(i * 3, i * 3 + 2), 16));
    }
    return sendMessage(content);
  }

  //使用的 CRC16 校验算法,确保发送和接收的数据没有被损坏
  function crc16modbus(data) {
		var crc = 0xFFFF;
		for (var i = 0; i < data.length; i++) {
			crc ^= data[i];
			for (var j = 0; j < 8; j++) {
				crc = (crc & 0x1) > 0 ? (crc >> 1) ^ 0xa001 : crc >> 1;
			}
		}
		return crc;
	}


  	// content: [u8, u8, ..]
	function sendMessage(content) {
		// if (!_chrct_cube || DEBUGBL) {
		// 	return DEBUGBL ? Promise.resolve() : Promise.reject();
		// }
		var msg = [0xfe];
		msg.push(4 + content.length); // length = 1 (op) + cont.length + 2 (crc)
		for (var i = 0; i < content.length; i++) {
			msg.push(content[i]);
		}
		var crc = crc16modbus(msg);
		msg.push(crc & 0xff, crc >> 8);
		var npad = (16 - msg.length % 16) % 16;
		for (var i = 0; i < npad; i++) {
			msg.push(0);
		}
		var encMsg = [];
		decoder = decoder || $.aes128(JSON.parse(LZString.decompressFromEncodedURIComponent(KEYS[0])));
		for (var i = 0; i < msg.length; i += 16) {
			var block = msg.slice(i, i + 16);
			decoder.encrypt(block);
			for (var j = 0; j < 16; j++) {
				encMsg[i + j] = block[j];
			}
		}
		console.log('[qiyicube] send message to cube', msg, encMsg);
		return _chrct_cube.writeValue(new Uint8Array(encMsg).buffer);
	}


	function clear() {
		var result = Promise.resolve();
		if (_chrct_cube) {
			_chrct_cube.removeEventListener('characteristicvaluechanged', onCubeEvent);
			result = _chrct_cube.stopNotifications().catch($.noop);
			_chrct_cube = null;
		}
		_service = null;
		_gatt = null;
		_deviceName = null;
		deviceMac = null;
		// curCubie = new mathlib.CubieCube();
		// prevCubie = new mathlib.CubieCube();
		prevMoves = [];
		lastTs = 0;
		batteryLevel = 0;
		return result;
	}


function parseCubeData(msg) {//蓝牙传来的原始数据包（Uint8Array）
		var locTime = $.now();
		if (msg[0] != 0xfe) {
			console.log('[qiyicube] error cube data', msg);
		}
		var opcode = msg[2];//操作码（消息类型）
		var ts = (msg[3] << 24 | msg[4] << 16 | msg[5] << 8 | msg[6]);
		if (opcode == 0x2) { // cube hello，不加这个会直报,魔方上电/初始化（Hello 包）
			batteryLevel = msg[35];//取出电池电量
			sendMessage(msg.slice(2, 7));//向魔方回应一条消息：sendMessage(msg.slice(2,7))（通常是握手回应）

			//初始化魔方
			//var newFacelet = parseFacelet(msg.slice(7, 34));//解析魔方面片颜色：parseFacelet(msg.slice(7, 34))→ 这表示从第 7~33 字节是面片颜色编码（共 27 *2=54字节）
			//GiikerCube.callback(newFacelet, [], [Math.trunc(ts / 1.6), locTime], _deviceName);
			//prevCubie.fromFacelet(newFacelet);
			// if (newFacelet != kernel.getProp('giiSolved', mathlib.SOLVED_FACELET)) {
			// 	var rst = kernel.getProp('giiRST');
			// 	if (rst == 'a' || rst == 'p' && confirm(CONFIRM_GIIRST)) {
			// 		giikerutil.markSolved();
			// 	}
			// }
		} 
		else if (opcode == 0x3) { // state change，魔方状态改变（转动事件）
			sendMessage(msg.slice(2, 7));//向魔方回应一条消息：sendMessage(msg.slice(2,7))（通常是握手回应）,回应一下魔方以保持连接心跳
			console.log("当前旋转动作：",[msg[34]);
		
		
		
		
		
		
		}
}
