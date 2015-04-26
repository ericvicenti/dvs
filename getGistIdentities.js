var GitHubApi = require("github");
var crypto = require("crypto");
 
var github = new GitHubApi({
  version: "3.0.0",
});
 
module.exports = function(id, cb, log) {
  log = log || console.log;
  var idMap = {};
  var forksToScrape;
 
  log('Fetching initial proof gist '+id);
 
  github.gists.get({
    id: id,
  }, function(err, gist) {
    if (err) return cb(err);
    extractVerification(gist);
    forksToScrape = gist.forks;
    scrapeIdForks(function(err) {
      if (err) return cb(err);
      cb(null, idMap);
    });
  });
 
  function extractVerification(gist) {
    log('Extracting ID from '+gist.id);
    var userId = 'github.com/' + gist.owner.login;
    var identityLabels = [];
    Object.keys(gist.files).forEach(function(fileName) {
      var idName = fileName.split('.')[0];
      if (identityLabels.indexOf(idName) === -1) {
        identityLabels.push(idName);
      }
    });
    identityLabels.forEach(function(label) {
      var pubKeyFile = label + '.publicKey.txt';
      var signatureFile = label + '.signature.txt';
      if (gist.files[pubKeyFile] && gist.files[signatureFile]) {
        var verify = crypto.createVerify('RSA-SHA256');
        verify.update(userId);
        if (verify.verify(gist.files[pubKeyFile].content, gist.files[signatureFile].content, 'hex')) {
          log('Verified '+gist.owner.login);
          idMap[gist.files[pubKeyFile].content] = {
            id: userId,
            label: label,
            updateTime: gist.updated_at,
          };
        }
      }
    });
  }
 
  function scrapeIdForks(cb) {
    if (!forksToScrape.length) {
      return cb(null);  
    }
    var fork = forksToScrape.pop();
    github.gists.get({
      id: fork.id,
    }, function(err, gist) {
      if (err) return cb(err);
      extractVerification(gist);
      return scrapeIdForks(cb);
    });
  }
}