require('dotenv').config();
var request = require('request')
var cheerio = require('cheerio')
const express = require('express')
const app = express()

// don't forget to fill these in.
// wikipedia url to redirect to a random article
var RANDOM_URL = 'https://ml.wikipedia.org/wiki/%E0%B4%AA%E0%B5%8D%E0%B4%B0%E0%B4%A4%E0%B5%8D%E0%B4%AF%E0%B5%87%E0%B4%95%E0%B4%82:%E0%B4%95%E0%B5%8D%E0%B4%B0%E0%B4%AE%E0%B4%B0%E0%B4%B9%E0%B4%BF%E0%B4%A4%E0%B4%82'
// google firebase key file
var FIREBASE_JSON_KEY = './some_file.json'
// firebase collection
var FIREBASE_COLLECTION = 'your_collection_name'
// css selector to identify article iext in wikipedia
var ARTICLE_SELECTOR = '.mw-body-content p,.mw-headline'
// timeout before next call to wikipedia (30000 => 30 seconds)
var MINE_TIMEOUT = 30000

const admin = require('firebase-admin')
var serviceAccount = require(FIREBASE_JSON_KEY)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
var db = admin.firestore()

var success_write = 0
var skip_write = 0
var fail_write = 0
var activated = false

// run article mining on a single random page
function act() {
	request(RANDOM_URL, function(err, resp, html) {
        if (!err){
          const $ = cheerio.load(html)
          var text = ''

          $(ARTICLE_SELECTOR).each(function(){
		    text += $(this).text()+'\n'
		  })

          var data = {}
          data.url = resp.request.uri.href
          data.text = text

		  var docRef = db.collection(FIREBASE_COLLECTION)
		  var query = docRef.where('url', '==', resp.request.uri.href).get()
		    .then(snapshot => {
		      var count = 0
		      snapshot.forEach(doc => {
		        count ++
		      })
		      if (count > 0) {
		      	  skip_write ++
		      	  setTimeout(function(){ act() }, MINE_TIMEOUT);
		      } else {
		      	  var timestamp = Date.now()
				  var docRef1 = db.collection(FIREBASE_COLLECTION).doc('parsed_'+timestamp)
				  docRef1.set(data).then(function(result){
				  	success_write ++
				  	 setTimeout(function(){ act() }, MINE_TIMEOUT);
				  }, function(result){
				  	fail_write ++
				  	 setTimeout(function(){ act() }, MINE_TIMEOUT);
				  })
		      }
		    })
		    .catch(err => {
		    	console.log(err)
		      fail_write ++
		      setTimeout(function(){ act() }, MINE_TIMEOUT);
		    })

  		  
      }
	})
}

// webhook to trigger mining
app.get('/activate', (req, res) => {
	if (! activated){
		activated = true
		act()
		res.send(200)
	} else {
		res.send('already activated.')
	}
})

// monitor current mining status
app.get('/monitor', (req, res) => {
	if (activated){
		res.send(JSON.stringify({success_write: success_write, fail_write: fail_write, skip_write: skip_write}))
	} else {
		res.send('not started')
	}
})

// get all mined data
app.get('/data', function (req, res) {
  var data = req.body
  var timestamp = Date.now()
  var docRef = db.collection(FIREBASE_COLLECTION)
  var getDoc = docRef.get()
    .then(snapshot => {
    	console.log('got docs')
      var result = []
      var count = 0
      var scount = 0
      snapshot.forEach(doc => {
      	result.push(doc.data())
        count ++
      })

      success_write = count

      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({n_docs:count, data:result}))
    })
    .catch(err => {
      res.send('Error getting documents', err)
    })
})

var port = process.env.PORT || 8080
app.listen(port, () => console.log('Example app listening on port '+port))