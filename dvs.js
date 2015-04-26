#!/usr/bin/env node

var level = require('level');
var diff = require('diff');
var crypto = require('crypto');
var exec = require('child_process').execFile;
var execSync = require('child_process').execFileSync;
var fs = require('fs');
var isBinary = require('is-binary');
var md5_file = require('md5-file').async;
var md5 = require('MD5');
var path = require('path');
var pm2 = require('pm2');
var program = require('commander');

var HOME_DIR = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var DVS_DIR = path.join(HOME_DIR, '.dvs');
execSync('mkdir', ['-p', DVS_DIR]);
var DVS_PRIVATE_KEY_FILE = path.join(DVS_DIR, 'dvs.key');
var DVS_PUBLIC_KEY_FILE = DVS_PRIVATE_KEY_FILE + '.pub';

var DVS_PRIVATE_KEY = null;
var DVS_PUBLIC_KEY = null;

// // Old stuff:

// function _isBufferBinary(buffer) {
//   return isBinary(buffer.toString('utf8'));
// }
// function _getAuthor() {
//   return process.env.DVS_AUTHOR || 'anonymous';
// }

// function _createFileCommit(file, cb) {
//   md5_file(file, function(dataId) {
//     var time = +new Date();
//     var fileName = path.basename(file);
//     var id = md5(fileName + dataId + time + _getAuthor());
//     fs.readFile(file, function(err, fileData) {
//       if (err) return cb(err);
//       var commit = {
//         data: fileData,
//         isBinary: _isBufferBinary(fileData),
//         name: fileName,
//         id: id,
//         dataId: dataId,
//         time: time,
//         author: _getAuthor(),
//       };
//       cb(null, commit);
//     });
//   });
// }

// function commitNewFile(file, cb) {
//   _createFileCommit(file, function(err, commit) {
//     if (err) return cb(err);
//     db.put(commit.id, JSON.stringify(commit), function(err) {
//       if (err) return cb(err);
//       return cb(null, commit.id);
//     });
//   });
// }

// function commitUpdatedFile(file, fromId, cb) {
//   get(fromId, function(err, fromCommit) {
//     if (err) return cb(err);
//     _createFileCommit(file, function(err, commit) {
//       if (err) return cb(err);
//       if (fromCommit.fromBase) {
//         commit.fromBase = fromCommit.fromBase;
//       } else {
//         commit.fromBase = fromCommit.fromId;
//       }
//       commit.from = fromId;
//       if (!fromCommit.isBinary) {
//         commit.patch = diff.createPatch('',
//           fromCommit.data.toString('utf8'),
//           commit.data.toString('utf8')
//         );
//         delete commit.data;
//       }
//       db.put(commit.sign, JSON.stringify(commit), function(err) {
//         if (err) return cb(err);
//         return cb(null, sign);
//       });
//     });
//   });
// }

// function commit(file, lastId, cb) {
//   if (lastId) {
//     commitUpdatedFile(file, lastId, cb);
//   } else {
//     commitNewFile(file, cb);
//   }
// }

// function _getPatched(destSign, destCommit, cb, _patched) {
//   db.get(destCommit.fromBase, function (err, baseCommitData) {
//     if (err) return cb(err);
//     var baseCommit = JSON.parse(baseCommitData);
//     baseCommit.data = new Buffer(baseCommit.data);
//     baseCommit
//     } else if (commitData.patch) {
//       return _getPatched(destSign, fromSign)
//     }
//   });
// }

// function get(sign, cb) {
//   db.get(sign, function (err, commitData) {
//     if (err) return cb(err);
//     var commit = JSON.parse(commitData);
//     if (commit.data) {
//       commit.data = new Buffer(commit.data);
//     } else if (commitData.fromBase) {
//       _getPatched(sign, commit, cb);
//     }
//     cb(null, commit);
//   });
// }

program
  .version('0.0.1')

  // legacy:
  // .option('-c, --commit [file]', 'Commit a file or folder')
  // .option('-f, --from [id]', 'ID of the source for a new commit')
  // .option('-g, --get [id]', 'Get a commit by ID')

  .option('--add-peer [host]', 'Link to a DVS peer')
  .option('--peers', 'List connected peers')
  .option('--port [port]', 'Specify the port when linking a new peer')
  .option('--start', 'Start the server')
  .option('--identify [identity]', 'Sign a string to prove your identity')
  .option('--stop', 'Stop the server')
  .option('-s --status', 'Get the status of the server')

  // dev:
  .option('--write-object [data]', 'Write a string obj')
  .option('--get-object [id]', 'Get an object by id')

  .parse(process.argv);

// if (program.commit) {
//   commit(program.commit, program.from, function(err, sign) {
//     if (err) {
//       console.error(err);
//     } else {
//       console.log('Committed ' + sign);
//     }
//   });
// } else if (program.get) {
//   get(program.get, function(err, commit) {
//     if (err) {
//       console.error(err);
//     } else {
//       console.log('Name: ' + commit.name);
//       console.log('Time: ' + new Date(commit.time));
//       // console.log('Content: ' + commit.data.toString('utf8'));
//     }
//   });
// }

var SERVER_NAME = 'dvs_server';

if (program.status) {
  pm2.connect(function(err) {
    pm2.list(function(err, list) {
      var processIndex = list.map(function(process) { return process.name; }).indexOf(SERVER_NAME);
      if (processIndex === -1) {
        console.log('Server is not yet started');
        pm2.disconnect();
        return;
      }
      console.log('Server is '+list[processIndex].pm2_env.status);
      pm2.disconnect();
    });
  });
  return;
}

if (program.start) {
  createKeyPairIfNeeded(function(err) {
    if (err) return console.log('Could not create your key pair in '+DVS_DIR);
    pm2.connect(function(err) {
      pm2.start(path.join(__dirname, 'dvs_server.js'), {name: SERVER_NAME}, function(err, proc) {
        if (!err && proc.success) {
          console.log('Server started');
        }
        pm2.disconnect();
      });
    });
  });
  return;
}

function dvsGet(endpoint, cb) {
  endpoint = endpoint.join ? endpoint.join('/') : endpoint;
  exec('curl', ['localhost:8288/' + endpoint], function(err, stdout, stderr) {
    if (err) {
      return cb(err);
    }
    var out = JSON.parse(stdout);
    cb(null, out);
  });
}

function dvsPost(endpoint, data, cb) {
  endpoint = endpoint.join ? endpoint.join('/') : endpoint;
  exec('curl', [
    'localhost:8288/' + endpoint,
    '-d',
    JSON.stringify(data),
    '-H',
    'Content-Type: application/json'
  ], function(err, stdout, stderr) {
    if (err) {
      return cb(err);
    }
    var out = JSON.parse(stdout);
    cb(null, out);
  });
}

function createKeyPairIfNeeded(cb) {
  fs.exists(DVS_PUBLIC_KEY_FILE, function(exists) {
    if (!exists) return createKeyPair(cb);
    fs.exists(DVS_PRIVATE_KEY_FILE, function(exists) {
      if (!exists) return createKeyPair(cb);
      cb();
    });
  });
}

function createKeyPair(cb) {
  exec('openssl', [
    'genrsa',
    '-out',
    DVS_PRIVATE_KEY_FILE,
    '2048'
  ], function(err) {
    if (err) return cb(err);
    exec('openssl', [
      'req',
      '-key',
      DVS_PRIVATE_KEY_FILE,
      '-new',
      '-x509',
      '-out',
      DVS_PUBLIC_KEY_FILE,
      '-subj',
      '/C=../ST=./L=./CN=.',
    ], function(err, stdout, stderr) {
      if (err) return cb(err);
      console.log('Key pair created in '+DVS_DIR);
      cb();
    });
  });
}

if (program.addPeer) {
  var port = program.port || 8288;
  if (typeof program.addPeer !== 'string') {
    console.log('You must specify the peer host!');
    console.log('eg. dvs -l 123.123.123.123 -p 8288');
    return;
  }
  dvsPost('peers', {host: program.addPeer, port: port}, function(err, peer) {
    if (err) {
      console.log('Could not add peer!');
      return;
    }
    console.log('Added DVS peer: ' + peer.host + ':' + peer.port );
  });
  return;
}

if (program.peers) {
  dvsGet('peers', function(err, peers) {
    if (err) {
      console.log('Could not fetch peers!');
      return;
    }
    console.log(peers);
  });
  return;
}

// Keep usage of pub/private key after this reading. Keep --start above this so the error is not shown
try {
  DVS_PRIVATE_KEY = fs.readFileSync(DVS_PRIVATE_KEY_FILE, { encoding: 'utf8' });
  DVS_PUBLIC_KEY = fs.readFileSync(DVS_PUBLIC_KEY_FILE, { encoding: 'utf8' });  
} catch(e) {
  console.log('Cannot read key pair! Run "dvs --start" to fix');
}

if (program.identify) {
  console.log('Public key:');
  console.log(DVS_PUBLIC_KEY);
  console.log('Signature for identity "'+program.identify+'":');
  var signer = crypto.createSign('RSA-SHA256');
  signer.update(program.identify);
  console.log(signer.sign(DVS_PRIVATE_KEY, 'hex'))
  return;
}

function packAndSign(data, identity, secret) {
  data.identity = identity;
  var signer = crypto.createSign('RSA-SHA256');
  signer.update(JSON.stringify(data));
  data.signature = signer.sign(DVS_PRIVATE_KEY, 'hex');
  return JSON.stringify(data);
}

if (program.writeObject) {
  var bundle = packAndSign({ obj: program.writeObject }, DVS_PUBLIC_KEY, DVS_PRIVATE_KEY);
  dvsPost('objects', {object: bundle}, function(err, response) {
    if (err) {
      console.log('Could not write object!');
      return;
    }
    console.log('Wrote object ID: '+response.id);
  });
  return;
}

if (program.getObject) {
  dvsGet('objects/'+program.getObject, function(err, response) {
    if (err) {
      console.log('Could not write object!');
      return;
    }
    console.log(response);
  });
  return;
}
>>>>>>> basic hacky object sharing
