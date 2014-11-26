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
    // Arity check
    if (arguments.length === 1) {
      // MODEL.readDocs(cb)
      cb = params;
      params = {};
    }

    return queryBuilder(this, params).exec(cb);
  });

  schema.static('readDocById', function readDocById(docId, params, cb) {
    // Arity check
    if (arguments.length === 2) {
      // readDocById(id, cb)
      cb = params;
      params = {};
    }

    return queryBuilder(this, params, docId).exec(function readDocByIdCallBack(err, doc) {
      return cb(err, doc);
    });
  });

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  schema.static('patchDocById', function patchDocById(docId, patch, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 3) {
      // MODEL.patchDocById(id, patch, cb)
      cb = params;
      params = {};
    }

    return Model.readDocById(docId, params, function patchDocByIdQuery(err, doc) {
      if (err || !doc) { return cb(err, null); }

      doc
      .set(patch)
      .save(function patchDocByIdSave(err, doc, count) {
        var queryParams;

        if (err) { return cb(err, null); }

        queryParams = _.clone(params, true);

        delete queryParams.where;

        return Model.readDocById(docId, queryParams, cb);
      });
    });
  });

  // Need to fetch and then remove a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  schema.static('destroyDocById', function destroyDocById(docId, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 2) {
      // MODEL.destroyDocById(id, cb)
      cb = params;
      params = {};
    }

    return Model.readDocById(docId, params, function destroyDocByIdQuery(err, doc) {
      if (err || !doc) { return cb(err, null); }

      return doc.remove(cb);
    });
  });

  // Model methods for subdocument collections

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  schema.static('createCollDoc', function createCollDoc(docId, collPath, collDoc, params, cb) {
    var Model = this;
    var collParams = {select: {_id: 1}};

    // Arity check
    if (arguments.length === 4) {
      // MODEL.createCollDoc(docId, collPath, collDoc, cb)
      cb = params;
      params = {};
    }

    // Retrieve empty collection for performance
    collParams.select[collPath] = {$slice: 0};

    if (params.where) { collParams.where = params.where; }

    return Model.readCollDocs(docId, collPath, collParams, function readDCollDocsCallBack(err, coll) {
      if (err || !coll) { return cb(err, null); }

      collDoc = coll.create(collDoc);

      // Add to collection
      coll.push(collDoc);

      return collDoc.parent().save(function createCollDocSave(err, doc, count) {
        if (err) { return cb(err, null); }

        collParams = _.clone(params, true);

        delete collParams.where;

        return Model.readCollDocById(docId, collPath, collDoc.id, collParams, cb);
      });
    });
  });

  schema.static('readCollDocs', function readCollDocs(docId, collPath, params, cb) {
    var Model = this;
    var queryParams = {};
    var collPathId = {};

    // Arity check
    if (arguments.length === 3) {
      // MODEL.readCollDocs(docId, collPath, cb)
      cb = params;
      params = {};
    }

    _.merge(queryParams, params);

    if (queryParams.select === undefined) {
      queryParams.select = collPath;
    }
    else {
      // Possible mongoose bug: if subdoc _id is not included with select statement
      // virtuals/getters will not populate id
      if (_.isPlainObject(queryParams.select)) {
        if (_.isPlainObject(queryParams.select[collPath])) {
          if (queryParams.select[collPath].$slice === undefined) {
            _.merge(queryParams.select[collPath], {_id: 1});
          }
        }
        else if (queryParams.select[collPath + '._id'] === undefined){
          collPathId[collPath] = {_id: 1};
          _.merge(queryParams.select, collPathId);
        }
      }
      else {
        queryParams.select += ' ' + collPath + '._id';
      }
    }

    // TODO: utilize aggregation to allow for sorting, paging, etc.
    // Main issue is once a subdocument is unwound, the returned objects are POJOs
    return Model.readDocById(docId, queryParams, function readDocByIdCallBack(err, doc) {
      return cb(err, doc && doc.get(collPath));
    });
  });

  schema.static('readCollDocById', function readCollDocById(docId, collPath, collId, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 4) {
      // MODEL.readCollDocById(docId, collPath, collId, cb)
      cb = params;
      params = {};
    }

    return Model.readCollDocs(docId, collPath, params, function readCollDocsCallBack(err, coll) {
      // Only return the desired subdocument
      // TODO: utilize aggregation to remove overhead of returning entire collection
      return cb(err, coll && coll.id(collId));
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

    Model.readCollDocById(docId, collPath, collId, collParams, function patchCollDocByIdCallBack(err, collDoc) {
      if (err || !collDoc) { return cb(err, null); }

      collDoc.set(collPatch);

      return collDoc.parent().save(function patchCollDocByIdSave(err, doc, count) {
        if (err) { return cb(err, null); }

        collParams = _.clone(params, true);

        delete collParams.where;

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

    Model.readCollDocById(docId, collPath, collId, collParams, function desctroyCollDocByIdCallBack(err, collDoc) {
      if (err || !collDoc) { return cb(err, null); }

      collDoc.remove();

      return collDoc.parent().save(function readDocByIdCallBack(err, doc) {
        return cb(err, collDoc);
      });
    });
  });
};

function queryBuilder(Model, params, docId) {
  var query = docId === undefined ? Model.find() : Model.findOne().where('_id', docId);
  params = params || {};

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

  return query;
}
