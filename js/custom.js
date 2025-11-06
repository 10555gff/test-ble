$(function(){
   const $scenBtn  = $('#connect');
   $scenBtn.click(function(){
       console.log('正在请求蓝牙设备...');
       window.deviceAPI.scanBluetoothDevices();
  });
 
   //...
  
 
});