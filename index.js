/*--------------------------------------------------------------------------------*/
/*  REQUIRED MODULES   */
var coap = require('coap');
var fs = require("fs");
var crc = require('crc');
/*--------------------------------------------------------------------------------*/
/*  GLOBAL VARIABLES   */
var otaImage = fs.readFileSync("ota_fota-client-test_0x0700.bin");
const CHUNK_SIZE = 64;
const LAST_BLOCK_NUMBER = (otaImage.length%CHUNK_SIZE)?(Math.floor(otaImage.length/CHUNK_SIZE)):(otaImage.length/CHUNK_SIZE-1);
var nextBlockNumber = 0;
var otaState = "IDLE";
/*--------------------------------------------------------------------------------*/
/*  CoAP SERVER - RECEIVING DATA FROM NODES   */
coap.createServer({ type: 'udp6' })
.on('request', function(req, res) { otaProcessRequest(req); res.end('Done!!!'); })
.listen(5683, null);
/*--------------------------------------------------------------------------------*/
/*  CoAP CLIENT  */
function sendCoapRequest(_uri, _payload=null, _blockwise=false, _blockOptVal=0x0)
{
  let coapReq = coap.request({host: "aaaa::0212:4b00:13e4:3a03", method: 'PUT', pathname: _uri, retrySend: 0})
      .on('response', function(res) { 
        otaProcessResponse(res);
        res.on('end', function(){ process.exit(0) }); 
      })
      .on('error', function(err){ console.error(err); });

  coapReq.setOption("Content-Format", "application/octet-stream");
  if(_blockwise) coapReq.setOption('Block1', _blockOptVal);
  if(_payload!==null) coapReq.write(_payload);
  coapReq.end();
}

function sendFwImg()
{
  console.log("SENDING IMAGE!!!");
  otaState = "DOWNLOADING";
  nextBlockNumber=0;
  sendNextBlock();
}

function otaProcessRequest(_request)
{
  if(_request.url==="/5/0" && otaState==="IDLE" && _request.payload.toString()==="Initialized")
  {
    sendFwImg();
  }
}

function otaProcessResponse(_response)
{
  console.log("Response on "+_response.url.toString()+" "+_response.code);
  if(_response.code.split('.')[0]==='4' || _response.code.split('.')[0]==='5') process.exit(0);
  if(otaState==="DOWNLOADING" && nextBlockNumber<LAST_BLOCK_NUMBER && _response.code.split('.')[0]==='2' && _response.code.split('.')[1]==='31')
  {
    if(_response.options[0].name==="Block1")
    {
      nextBlockNumber = (_response.options[0].value.readUIntBE(0, _response.options[0].value.length)>>4) + 1;
    }
    sendNextBlock();
  }
}

function constructBlockOption()
{
  let _more = (nextBlockNumber===LAST_BLOCK_NUMBER)?0x00:0x08;
  let _optValue;

  if(nextBlockNumber<=0x0F)
  {
    _optValue = new Buffer.from([(nextBlockNumber&0x0F)<<4|_more|0x2]);
  }
  else if(nextBlockNumber>0x0F && nextBlockNumber<=0x0FFF)
  {
    _optValue = new Buffer.from([(nextBlockNumber&0xFFF0)>>4, (nextBlockNumber&0x000F)<<4|_more|0x2]);
  }
  return _optValue;
}

function sendNextBlock()
{
  console.log("Block Number: "+nextBlockNumber);
  let _data;
  if((nextBlockNumber===LAST_BLOCK_NUMBER) && (otaImage.length%CHUNK_SIZE))
  {
    _data = new Buffer.allocUnsafe(otaImage.length%CHUNK_SIZE).fill(0);
    otaImage.copy(_data, 0, nextBlockNumber*CHUNK_SIZE, nextBlockNumber*CHUNK_SIZE+(otaImage.length%CHUNK_SIZE));
  }
  else 
  {
    _data = new Buffer.allocUnsafe(CHUNK_SIZE).fill(0);
    otaImage.copy(_data, 0, nextBlockNumber*CHUNK_SIZE, nextBlockNumber*CHUNK_SIZE+CHUNK_SIZE);
  }
  sendCoapRequest('5/1', _data, true, constructBlockOption());
}

function initiateOta()
{
  console.log("Initializing OTA");
  console.log("Size: "+otaImage.length);
  console.log("LAST_BLOCK_NUMBER: "+LAST_BLOCK_NUMBER);
  otaState = "IDLE";
  sendCoapRequest('5/0');
}
/*--------------------------------------------------------------------------------*/
initiateOta();