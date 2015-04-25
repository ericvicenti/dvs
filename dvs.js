#!/usr/bin/env node

var level = require('level');
var diff = require('diff');
var fs = require('fs');
var isBinary = require('is-binary');
var md5_file = require('md5-file').async;
var md5 = require('MD5');
var path = require('path');
var pm2 = require('pm2');
var program = require('commander');

var HOME_DIR = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

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
  // .option('-c, --commit [file]', 'Commit a file or folder')
  // .option('-f, --from [id]', 'ID of the source for a new commit')
  // .option('-g, --get [id]', 'Get a commit by ID')
  .option('-s --status', 'Get the status of the server')
  .option('--start', 'Start the server')
  .option('--stop', 'Stop the server')
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
} else if (program.start) {
  pm2.connect(function(err) {
    pm2.start(path.join(__dirname, 'dvs_server.js'), {name: SERVER_NAME}, function(err, proc) {
      if (!err && proc.success) {
        console.log('Server started');
      }
      pm2.disconnect();
    });
  });
} else if (program.stop) {
  pm2.connect(function(err) {
    pm2.stop(SERVER_NAME, function(err, proc) {
      if (!err && proc.success) {
        console.log('Server stopped');
      }
      pm2.disconnect();
    });
  });
}


