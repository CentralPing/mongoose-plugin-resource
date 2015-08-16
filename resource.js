var _ = require('lodash-node/modern');

module.exports = function resourceControlPlugin(schema, pluginOptions) {
  var paths = Object.keys(schema.paths);

  // Creates a new document and returns a whitelisted document on success
  schema.static('createDoc', function createDoc(obj, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 2 && _.isFunction(params)) {
      // MODEL.createDoc(obj, cb)
      cb = params;
      params = {};
    }

    // Need to do a find to apply schema options (select, default, etc.) and
    //   any passed in params
    // If no callback returns promise with `err` from create or findOne query
    return Model.create(obj).then(function createDocCreated(doc) {
      return Model.readDocById(doc.id, params, cb);
    }).then(null, function createDocErr(err) {
      if (cb) { cb(err); }
      throw err;
    });
  });

  schema.static('readDocs', function readDocs(params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 1 && _.isFunction(params)) {
      // MODEL.readDocs(cb)
      cb = params;
      params = {};
    }

    // Promise is always returned regardless if callback is defined
    return queryBuilder(Model.find(), params).exec(cb);
  });

  schema.static('readDocById', function readDocById(docId, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 2 && _.isFunction(params)) {
      // MODEL.readDocById(id, cb)
      cb = params;
      params = {};
    }

    // Promise is always returned regardless if callback is defined
    return queryBuilder(Model.findById(docId), params).exec(cb);
  });

  schema.static('patchDocById', function patchDocById(docId, patch, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 3 && _.isFunction(params)) {
      // MODEL.patchDocById(id, patch, cb)
      cb = params;
      params = {};
    }

    // mongoose's findAnd methods skip mongoose validations
    //   To trigger the validation first retrieve the doc, apply the patch and
    //   then validate.
    // http://mongoosejs.com/docs/api.html#model_Model.findOneAndUpdate
    return Model.readDocById(docId, params).then(function readDocByIdFound(doc) {
      // `null` if parent document wasn't found
      if (doc === null) {
        if (cb) { return cb(null, doc); }

        return doc;
      }

      var promise = new Model.base.Promise();

      return doc.set(patch).save(cb);
    }).then(null, function patchDocByIdError(err) {
      if (cb) { return cb(err); }
      throw err;
    });
  });

  schema.static('destroyDocById', function destroyDocById(docId, params, cb) {
    var Model = this;

    // Arity check
    if (arguments.length === 2 && _.isFunction(params)) {
      // MODEL.destroyDocById(id, cb)
      cb = params;
      params = {};
    }

    // Promise is always returned regardless if callback is defined
    return queryBuilder(Model.findByIdAndRemove(docId), params).exec(cb);
  });

  // Model methods for subdocument collections

  // TODO: honor subdoc field select options in schemas

  // Need to fetch collection object from parent, push child document,
  //   save parent document and then fetch new child document to apply
  //   schema options (select, default, etc.) and any passed in params
  //   http://mongoosejs.com/docs/subdocs.html
  //   https://github.com/LearnBoost/mongoose/issues/2210
  schema.static('createCollDoc', function createCollDoc(docId, collPath, collObj, params, cb) {
    var Model = this;
    var collParams = {select: {_id: 1}};

    // Arity check
    if (arguments.length === 3 && _.isPlainObject(collObj)) {
      // MODEL.createCollDoc(docId, collPath, collObj)
      params = {};
    }
    else if (arguments.length === 4 && _.isFunction(params)) {
      // MODEL.createCollDoc(docId, collPath, collObj, cb)
      cb = params;
      params = {};
    }

    // Retrieve empty collection for performance
    collParams.select[collPath] = {$slice: 0};

    if (params.where) { collParams.where = params.where; }

    return Model.readCollDocs(docId, collPath, collParams).then(function readDCollDocsFound(coll) {
      // No document found
      // Pass to next `then` if null
      if (coll === null) { return coll; }

      // Add to collection
      // Pushing casts the object to a model instance
      coll.push(collObj);

      // There will always only be one item due to `{$slice: 0}`
      collDocId = coll[0].id;

      return coll[0].parent().save();
    }).then(function createCollDocSaved(doc) {
      // `null` if parent document wasn't found
      if (doc === null) {
        if (cb) { return cb(null, doc); }

        return doc;
      }

      collParams = _.clone(params, true);
      delete collParams.where;

      return Model.readCollDocById(docId, collPath, collDocId, collParams, cb);
    }).then(null, function createCollDocError(err) {
      if (cb) { cb(err); }
      throw err;
    });
  });

  schema.static('readCollDocs', function readCollDocs(docId, collPath, params, cb) {
    var Model = this;
    var queryParams = {};
    var collPathId = {};

    // Arity check
    if (arguments.length === 2 && _.isString(collPath)) {
      // MODEL.readCollDocs(docId, collPath)
      params = {};
    }
    else if (arguments.length === 3 && _.isFunction(params)) {
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
    // Main issue is mongoose can't update arrays using projections
    return Model.readDocById(docId, queryParams).then(function readDocByIdFound(doc) {
      var coll = (doc && doc.get(collPath)) || null;

      if (cb) { cb(null, coll); }

      return coll;
    }).then(null, function readCollDocsError(err) {
      if (cb) { cb(err); }
      throw err;
    });
  });

  schema.static('readCollDocById', function readCollDocById(docId, collPath, collId, params, cb) {
    var Model = this;
    var select = {};
    select[collPath] = {$elemMatch: {_id: collId}};

    // Arity check
    if (arguments.length === 3 && _.isString(collId)) {
      // MODEL.readCollDocById(docId, collPath, collId)
      params = {};
    }
    else if (arguments.length === 4 && _.isFunction(params)) {
      // MODEL.readCollDocById(docId, collPath, collId, cb)
      cb = params;
      params = {};
    }

    // Promise is always returned regardless if callback is defined
    return queryBuilder(Model.findById(docId).select(select), params).exec().then(function readCollDocsFound(coll) {
      var collDoc = ((coll && coll.get(collPath) || [])[0]) || null;

      if (cb) { cb(null, collDoc); }

      return collDoc;
    }).then(null, function readCollDocByIdError(err) {
      if (cb) { cb(err); }
      throw err;
    });
  });

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  // Need to retrieve entire collection to update a single subdocument
  //   will need to monitor for performance concerns
  schema.static('patchCollDocById', function patchCollDocById(docId, collPath, collId, collPatch, params, cb) {
    var Model = this;
    var query = {_id: docId};
    var select = {};
    var patch = {};

    select[collPath] = {$elemMatch: {_id: collId}};
    query[collPath] = {$elemMatch: {_id: collId}};

    Object.keys(collPatch).forEach(function mapPatch(key) {
      patch[collPath + '.$.' + key] = collPatch[key];
    });

    // Arity check
    if (arguments.length === 4 && _.isPlainObject(collPatch)) {
      // MODEL.patchCollDocById(docId, collPath, collId, collPatch)
      params = {};
    }
    else if (arguments.length === 5 && _.isFunction(params)) {
      // MODEL.patchCollDocById(docId, collPath, collId, patch, cb)
      cb = params;
      params = {};
    }

    return Model.readCollDocById(docId, collPath, collId, params).then(function readCollDocByIdFound(collDoc) {
      // `null` if collection document wasn't found
      if (collDoc === null) {
        if (cb) { return cb(null, collDoc); }

        return collDoc;
      }

      var promise = new Model.base.Promise();

      collDoc.set(collPatch).validate(function (err) {
        promise.resolve(err);
      });

      return promise.then(function patchCollDocByIdValidated() {
        // {new: true} to return updated document
        //   https://github.com/LearnBoost/mongoose/issues/2262
        // Promise is always returned regardless if callback is defined;
        return queryBuilder(Model.findOneAndUpdate(query, patch, {new: true}).select(select), params).exec().then(function patchCollDocByIdUpdated(coll) {
          // `null` if collection  wasn't found
          collDoc = ((coll && coll.get(collPath) || [])[0]) || null;

          if (cb) { cb(null, collDoc); }

          return collDoc;
        });
      });
    }).then(null, function patchCollDocByIdError(err) {
      if (cb) { cb(err); }
      throw err;
    });
  });

  // Need to fetch and then save a document to trigger MongooseJS middleware hooks
  //   https://github.com/LearnBoost/mongoose/issues/964
  // Need to retrieve entire collection to update a single subdocument
  //   will need to monitor for performance concerns
  schema.static('destroyCollDocById', function destroyCollDocById(docId, collPath, collId, params, cb) {
    var Model = this;
    var select = {};
    var patch = {$pull: {}};

    select[collPath] = {$elemMatch: {_id: collId}};
    patch.$pull[collPath] = {_id: collId};

    // Arity check
    if (arguments.length === 3 && _.isString(collId)) {
      // MODEL.destroyCollDocById(docId, collPath, collId)
      params = {};
    }
    else if (arguments.length === 4 && _.isFunction(params)) {
      // MODEL.destroyCollDocById(docId, collPath, collId, cb)
      cb = params;
      params = {};
    }

    return queryBuilder(Model.findByIdAndUpdate(docId, patch).select(select), params).exec().then(function patchCollDocByIdUpdated(coll) {
      // `null` if collection wasn't found
      var collDoc = ((coll && coll.get(collPath) || [])[0]) || null;

      if (cb) { cb(null, collDoc); }

      return collDoc;
    }).then(null, function destroyCollDocByIdError(err) {
      if (cb) { cb(err); }
      throw err;
    });
  });
};

function queryBuilder(query, params) {
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

  if (params.lean) { query.lean(); }

  return query;
}
