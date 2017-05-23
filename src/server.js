var express = require('express');
var bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
var fs = require('fs');
var database = require('./database');
var path = require('path');
var codec = require('./codec');
var utils = require('./utils');

var log = require('electron-log');

var app = module.exports = express();

console.log('dirname', __dirname);
app.use(express.static(path.join(__dirname, '..')));

app.use(bodyParser());
app.use(fileUpload());

// database logged in middleware
app.use(function (req, res, next) {
    if (!database.logged_in) {
        req.url = '/db';
    }
    next();
});


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.get('/db', function (req, res) {
    if (database.logged_in) {
        res.render('db_logout', { message: '' });
    } else {
        res.render('db_settings', { message: '' });
    }

});

app.post('/db-drop', function (req, res) {
    database.logout();
    res.redirect('/db');
});

app.post('/db', function (req, res) {
    if (req.body.url && req.body.user && req.body.password) {
        var url = req.body.url;
        var user = req.body.user;
        var password = req.body.password;
        log.info('connecting to '+url+' as '+user);
        if (!database.login(url, user, password)) {
            log.warn('connection failed ' + url + ' as '+ user);
            return res.render('db_settings', { message: 'Login failed' });
        }
        res.redirect('/')
    } else {
        log.info('missing params for POST to /db');
        return res.render('db_settings', { message: 'Missing data' });
    }
});

app.post('/save_xml', function (req, res) {
    if (req.body.filename && req.body.xml) {
        log.info('/save_xml ' + filename);
        var filename = req.body.filename;
        var xml = req.body.xml;

        if (filename.length === 0) {
            log.warn('Filename in /save_xml is empty -> fallback: draft.xml');
            filename = 'draft.xml';
        }

        xml = decodeURIComponent(xml);
        filename = decodeURIComponent(filename);

        // check for path escapes (http://localhost/../../../../../etc/passwd)
        // -> only save to files in the uploaded_xmls folder
		var target_file = path.join(__dirname, '../media/uploaded_xmls/', filename);
		if (filename.indexOf(path.join(__dirname, '../media/uploaded_xmls/')) == 0 ) {
		    log.info('XML has valid path: ' + target_file);
        } else {
		    log.error('XML path tried to escape: ' + target_file);
		    return res.status(400).send('Error');
        }
        // write file to uploaded_xmls
        fs.writeFile(target_file, xml, function(err){
            if (err) {
                log.error('There was an error saving the xml: ' + target_file);
                return res.status(500).send("Error saving the file");
            }
            log.info('XML saved: ' + target_file);
            return res.status(200).send("File saved");
        });
    } else {
		log.info('missing param');
        return res.status(400).send("Missing parameter");
    }
});

app.post('/', function (req, res) {
    if (!req.files) {
        log.warn('Image upload without image');
        return res.status(400).send('No files were uploaded.');
    }

    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    var image_file = req.files.image;

    // Use the mv() method to place the file somewhere on your server
    var new_file_name = path.join(__dirname, '..', 'media', 'uploaded_images', image_file.name);

    if (new_file_name.indexOf(path.join(__dirname, '..', 'media', 'uploaded_images')) == 0 ) {
        log.info('Image has valid path: ' + new_file_name);
    } else {
        log.error('Image path tried to escape: ' + new_file_name);
        return res.status(400).send('Error');
    }

    // write file to uploaded_images
    image_file.mv(new_file_name, function (err) {
        if (err) {
            log.error('There was an error saving the image: ' + new_file_name);
            return res.status(500).send(err);
        }
        utils.get_exif_from_image(new_file_name, function(exif_err, exif_data) {
            if (exif_err) {
                log.warn('There was an error reading exif from image: ' + new_file_name);
                exif_data = null;
            }
            database.add_image(image_file.name, exif_data).then(function () {
                log.info('Added image: ' + new_file_name);
                res.status(200).redirect('/');
            }, function(err){
                log.error('Error on adding an image to the database: ' + new_file_name);
                return res.status(500).send(err);
            });
        });
    });
});

app.get('/autocomplete/token/values', function(req, res){
    var search_string = req.query.term || '';
    var key = req.query.field;
    console.log(key);
    if (!key)
        return res.status(400).jsonp([]);
    var values = database.get_all_property_values_for_token(key, search_string).then(function(values){
        res.jsonp(values);
    });
});


app.get('/autocomplete/token/keys', function(req, res){
    var search_string = req.query.term || '';
    var keys = database.get_all_property_keys_for_token(search_string).then(function(keys){
        res.jsonp(keys);
    });
});


app.get('/', function (req, res) {
    database.get_all_images().then(function (results) {
            var row_data = [];
            results.forEach(function (r) {
                row_data.push([r.get('ident'), r.get('file_path'), r.get('upload_date')]);
            });
            res.render('image_table',
                {
                    message: '',
                    rows: row_data
                });
        }
    );
});

app.get('/image/:id(\\d+)/delete', function (req, res) {
    if (req.params.id) {
        var id_ = req.params.id;
        database.remove_image_by_id(id_).then(function (result) {
            res.redirect('/');
        }, res.status(400).send);
    } else {
        res.send("Missing parameter");
    }
});

app.get('/image/:image_id(\\d+)/fragment/:fragment_id(\\d+)/delete', function (req, res) {
    if (req.params.image_id && req.params.fragment_id) {
        database.remove_fragment(req.params.image_id, req.params.fragment_id, false)
            .then(function (result) {
                res.redirect('/image/'+ req.params.image_id +'/fragments');
            }, res.status(400).send);
    } else {
        res.send("Missing parameter");
    }
});

app.get('/image/:image_id(\\d+)/fragment/:fragment_id(\\d+)/to-db', function (req, res) {
    if (req.params.image_id && req.params.fragment_id) {
        database.remove_fragment(req.params.image_id, req.params.fragment_id, true).then(function(success){
            codec.mxgraph_to_neo4j(req.params.image_id, req.params.fragment_id, function(err, data){
                if (err) {
                    return res.status(400).send(err);
                }
                res.redirect('/image/'+ req.params.image_id +'/fragments');
            });
        }, function(err){
            res.status(500).send(err);
        });
    } else {
        res.send("Missing parameter");
    }
});

app.post('/image/:id(\\d+)/create-fragment', function (req, res) {
    if (req.body.name && req.params.id) {
        var name = req.body.name;
        database.add_fragment(req.params.id, name).then(
            function(result){
                res.redirect('/image/'+ req.params.id +'/fragments');
            }, function(err){
                res.send(err);
            });
    } else {
        log.warn('Missing params for /create-fragment');
        return res.status(400).send("Missing POST parameter name or image_id");
    }
});

app.get('/image/:id(\\d+)/fragments', function (req, res) {
    if (!req.params.id) {
        return res.send("Missing parameter");
    }
    database.get_fragments_by_image_id(req.params.id).then(function (results) {
            var row_data = [];
            results.forEach(function (r) {
                row_data.push(
                    [
                        r.get('image_id'),
                        r.get('file_path'),
                        r.get('fragment_id'),
                        r.get('fragment_name'),
                        r.get('upload_date'),
                        r.get('completed')
                    ]
                );
            });
            res.render('fragment_table',
                {
                    message: '',
                    rows: row_data,
                    image_id: req.params.id
                });
        }
    );
});



if (!module.parent) {
    app.listen(4000);
    log.info('TransliterationApplication Server started on port 4000');
    console.log('TransliterationApplication Server started an express server on port 4000');
    console.log('READY');
}