var mongoose = require('mongoose');
var _ = require('lodash-node/modern');

var ObjectId = mongoose.Types.ObjectId;

module.exports = function resourceControlPlugin(schema, pluginOptions) {
  var paths = Object.keys(schema.paths);

  // Creates a new document and returns the whitelisted document on success
  schema.static('createDoc', function createDoc(doc, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 2) {
      // MODEL.createDoc(doc, cb)
      cb = params;
      params = {};
    }

    doc = new Model(doc);

    return doc.save(function createDocSave(err, doc, count) {
      if (err) { return cb(err, null); }

      return Model.readDocById(doc.id, params, cb);
    });
  });

  schema.static('readDocs', function readDocs(params, cb) {
    var Model = this;
    var query = Model.find();

    // Arity check
    if (arguments.length === 1) {
      // MODEL.readDocs(cb)
      cb = params;
      params = {};
    }

    if (params.select) { query.select(params.select); }
    if (params.where) { query.where(params.where); }
    if (params.sort) { query.sort(params.sort); }

    if (_.isObject(params.skip)) {
      query[params.skip.operator](params.skip.path, params.skip.val);
    }
    else if (_.isNumber(params.skip)) {
      query.skip(params.skip);
    }

    if (_.isNumber(params.limit)) { query.limit(params.limit); }

    if (params.populate) { query.populate(params.populate); }

    return query.exec(cb);
  });

  schema.static('readDocById', function readDocById(id, params, cb) {
    var Model = this;
    var queryParams;

    // Arity check
    if (arguments.length === 2) {
      // readDocById(id, cb)
      cb = params;
      params = {};
    }

    // Add where clause for _id match
    queryParams = _.merge({}, params, {limit: 1, where: {_id: id}});

    return Model.readDocs(queryParams, function readDocsCallBack(err, docs) {
      return cb(err, docs && docs[0] || null);
    });
  });

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  schema.static('patchDocById', function patchDocById(id, patch, params, cb) {
    var Model = this;
    var query = Model.findOne().select('_id').where('_id', id);

    // Arity check
    if (arguments.length === 3) {
      // MODEL.patchDocById(id, patch, cb)
      cb = params;
      params = {};
    }

    if (params.where) { query.where(params.where); }

    query.exec(function patchDocByIdFind(err, doc) {
      if (err || !doc) { return cb(err, null); }

      doc
      .set(patch)
      .save(function patchDocByIdSave(err, doc, count) {
        var queryParams;

        if (err) { return cb(err, null); }

        queryParams = _.clone(params, true);

        delete queryParams.where;

        return Model.readDocById(doc.id, queryParams, cb);
      });
    });
  });

  // Need to fetch and then remove a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  schema.static('destroyDocById', function destroyDocById(id, params, cb) {
    var Model = this;
    var query = Model.findOne().select('_id').where('_id').equals(id);

    // Arity check
    if (arguments.length === 2) {
      // MODEL.destroyDocById(id, cb)
      cb = params;
      params = {};
    }

    if (params.where) { query.where(params.where); }

    query.exec(function destroyDocByIdFind(err, doc) {
      if (err || !doc) { return cb(err, null); }

      return doc.remove(cb);
    });
  });

  // Model methods for subdocument collections

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  schema.static('createCollDoc', function createCollDoc(docId, collPath, collDoc, params, cb) {
    var Model = this;
    var collParams;

    // Arity check
    if (arguments.length === 4) {
      // MODEL.createCollDoc(docId, collPath, collDoc, cb)
      cb = params;
      params = {};
    }

    // Clone and overwrite select for only _id for performance
    collParams = _.merge({}, params);
    collParams.select = {_id: 1};

    // Retrieve empty collection for performance
    collParams.select[collPath] = {$slice: 0};

    Model.readDocById(docId, collParams, function readDocByIdCallBack(err, doc) {
      var coll = doc && doc.get(collPath);

      if (err || !coll) { return cb(err, null); }

      collDoc = coll.create(collDoc);

      // Add to collection
      coll.push(collDoc);

      return doc.save(function createCollDocSave(err, doc, count) {
        if (err) { return cb(err, null); }

        delete collParams.where;
        delete collParams.select;

        return Model.readCollDocById(docId, collPath, collDoc.id, collParams, cb);
      });
    });
  });

  // Use aggregate framework since using $elemMatch as a projection mitigates all
  // other projections in a collection (possible Mongo bug?)
  schema.static('readCollDocs', function readCollDocs(docId, collPath, params, cb) {
    var Model = this;
    var query = Model.aggregate();
    var collParams = {where: {_id: ObjectId(docId)}, project: {}};
    var group = {_id: '$_id'};

    // Arity check
    if (arguments.length === 3) {
      // MODEL.readCollDocs(docId, collPath, cb)
      cb = params;
      params = {};
    }

    // Project _id to id since virtuals can't included
    collParams.project[collPath + '.id'] = '$' + collPath + '._id';
    collParams = _.merge({}, collParams, params);

    query.match(collParams.where);
    query.limit(1);
    query.unwind(collPath);

    if (collParams.match) { query.match(collParams.match); }
    if (collParams.sort) { query.sort(collParams.sort); }
    if (_.isNumber(collParams.skip)) { query.skip(collParams.skip); }
    if (_.isNumber(collParams.limit)) { query.limit(collParams.limit); }
    if (collParams.project) { query.project(collParams.project); }

    group[collPath] = {$push: '$' + collPath};
    query.group(group);

    return query.exec(function readCollDocsQueryCallBack(err, collDocs) {
      if (err || !collDocs.length) { return cb(err, null); }

      if (collParams.populate) {
        return Model.populate(collDocs, collParams.populate, function readCollDocsQueryPopulateCallBack(err, collPopDocs) {
          if (err || !collPopDocs.length) { return cb(err, null); }

          cb(err, collPopDocs[0][collPath]);
        });
      }

      cb(err, collDocs[0][collPath]);
    });
  });

  schema.static('readCollDocById', function readCollDocById(docId, collPath, collId, params, cb) {
    var Model = this;
    var collParams = {match: {}, limit: 1};

    // Arity check
    if (arguments.length === 4) {
      // MODEL.readCollDocById(docId, collPath, collId, cb)
      cb = params;
      params = {};
    }

    collParams.match[collPath + '._id'] = ObjectId(collId);
    collParams = _.merge({}, collParams, params);

    Model.readCollDocs(docId, collPath, collParams, function readCollDocsCallBack(err, doc) {
      // Only return the desired subdocument
      return cb(err, doc && doc[0] || null);
    });
  });

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  // Need to retrieve entire collection to update a single subdocument
  //   will need to monitor for performance concerns
  schema.static('patchCollDocById', function patchCollDocById(docId, collPath, collId, collPatch, params, cb) {
    var Model = this;
    var collParams;

    // Arity check
    if (arguments.length === 5) {
      // MODEL.patchCollDocById(docId, collPath, collId, patch, cb)
      cb = params;
      params = {};
    }

    // Clone and overwrite select for only _id for performance
    collParams = _.merge({}, params, {select: {_id: 1}});
    collParams.select[collPath + '._id'] = 1;

    Model.readDocById(docId, collParams, function patchCollDocByIdCallBack(err, doc) {
      var collDoc = doc && doc.get(collPath).id(collId);

      if (err || !collDoc) { return cb(err, null); }

      collDoc.set(collPatch);

      return doc.save(function patchCollDocByIdSave(err, doc, count) {
        if (err) { return cb(err, null); }

        delete collParams.where;
        delete collParams.select;

        return Model.readCollDocById(docId, collPath, collId, collParams, cb);
      });
    });
  });

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  // Need to retrieve entire collection to update a single subdocument
  //   will need to monitor for performance concerns
  schema.static('destroyCollDocById', function destroyCollDocById(docId, collPath, collId, params, cb) {
    var Model = this;
    var collParams;

    // Arity check
    if (arguments.length === 4) {
      // MODEL.destroyCollDocById(docId, collPath, collId, cb)
      cb = params;
      params = {};
    }

    // Clone and overwrite select for only _id for performance
    collParams = _.merge({}, params, {select: {_id: 1}});
    collParams.select[collPath + '._id'] = 1;

    Model.readDocById(docId, collParams, function desctroyCollDocByIdCallBack(err, doc) {
      var collDoc = doc && doc.get(collPath).id(collId);

      if (err || !collDoc) { return cb(err, null); }

      collDoc.remove();

      return doc.save(function readDocByIdCallBack(err, doc) {
        return cb(err, collDoc);
      });
    });
  });
};
