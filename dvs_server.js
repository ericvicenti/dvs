#!/usr/bin/env node

var level = require('level');
var express = require('express');
var exec = require('child_process').exec;
var path = require('path');

var HOME_DIR = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var SERVER_PORT = 8288;

var app = express();
var db = level(path.join(HOME_DIR, '.dvs'));
var peers = [];

function returnErr(res, err) {
  res.status(500);
  res.send('There has been a big mistake! ', err);
  res.end();
}

exec('curl -4 ifconfig.co', {}, function(err, stdout, stderr) {
  if (err) {
    sendErr(res, err);
    console.error(err);
    return;
  }
  var ip = stdout.split('\n')[0];
  peers.push({
    host: ip,
    port: SERVER_PORT
  });
  console.log(peers);
});

app.get('/peers', function(req, res, next) {
  res.send(peers);
});

app.post('/peers', function(req, res, next) {

});

app.listen(SERVER_PORT);
