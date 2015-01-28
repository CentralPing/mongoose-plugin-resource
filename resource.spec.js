var mongoose = require('mongoose');
var resource = require('./resource');
var _ = require('lodash-node/modern');
var Schema = mongoose.Schema;
var connection;

// Mongoose uses internal caching for models.
// While {cache: false} works with most models, models using references
// use the internal model cache for the reference.
// This removes the mongoose entirely from node's cache
delete require.cache.mongoose;

// Test data
var blogData = {
  title: 'My first blog! #Super',
  blog: 'This is my very first #blog! I hope you enjoy it. #WOOHOO'
};
var blogPatch = {
  blog: 'This is my update.'
};

describe('Mongoose plugin: resource', function () {
  var Blog;
  var BlogAnon;
  var users;
  var blogDataOwners;
  var ownerChecks;
  var ownerGroupChecks;
  var params = {
    select: 'title blog created.by readers',
    populate: [
      {path: 'created.by', select: 'displayName'},
      {path: 'readers', select: 'displayName'}
    ]
  };

  beforeAll(function (done) {
    connection = mongoose.createConnection('mongodb://localhost/unit_test');
    connection.once('connected', function () {
      done();
    });
  });

  afterAll(function (done) {
    connection.db.dropDatabase(function (err, result) {
      connection.close(function () {
        done();
      });
    });
  });

  it('should compile the models with the resource plugin', function (done) {
    var schema = BlogSchema();
    var anonSchema = BlogAnonSchema();
    schema.plugin(resource);
    anonSchema.plugin(resource);

    expect(Object.keys(schema.statics).length).toBe(10);
    expect(schema.statics.createDoc).toBeDefined();
    expect(schema.statics.readDocs).toBeDefined();
    expect(schema.statics.readDocById).toBeDefined();
    expect(schema.statics.patchDocById).toBeDefined();
    expect(schema.statics.destroyDocById).toBeDefined();
    expect(schema.statics.createCollDoc).toBeDefined();
    expect(schema.statics.readCollDocs).toBeDefined();
    expect(schema.statics.readCollDocById).toBeDefined();
    expect(schema.statics.patchCollDocById).toBeDefined();
    expect(schema.statics.destroyCollDocById).toBeDefined();

    Blog = model('Blog', schema);
    BlogAnon = model('BlogAnon', anonSchema);

    expect(Blog).toEqual(jasmine.any(Function));
    expect(BlogAnon).toEqual(jasmine.any(Function));

    done();
  });

  it('should save users to DB', function (done) {
    var User = model('User', UserSchema());
    User.create([{displayName: 'Foo'}, {displayName: 'Bar'}, {displayName: 'FooBar'}], function (err, fooUser, barUser, foobarUser) {
      expect(err).toBe(null);
      users = {
        fooUser: fooUser,
        barUser: barUser,
        foobarUser: foobarUser
      };
      blogDataOwners = {
        fooUser: {created: {by: fooUser.id}},
        barUser: {created: {by: barUser.id}, readers: [fooUser.id]},
        foobarUser: {created: {by: foobarUser.id}, readers: [fooUser.id, barUser.id]}
      };
      ownerChecks = {
        fooUser: {where: {'created.by': fooUser.id}},
        barUser: {where: {'created.by': barUser.id}},
        foobarUser: {where: {'created.by': foobarUser.id}}
      };
      ownerGroupChecks = {
        fooUser: {where: {$or: [{'created.by': fooUser.id}, {'readers': fooUser.id}]}},
        barUser: {where: {$or: [{'created.by': barUser.id}, {'readers': barUser.id}]}},
        foobarUser: {where: {$or: [{'created.by': foobarUser.id}, {'readers': foobarUser.id}]}}
      };

      Object.keys(blogData).forEach(function (key) {
        blogDataOwners.fooUser[key] = blogData[key];
        blogDataOwners.barUser[key] = blogData[key];
        blogDataOwners.foobarUser[key] = blogData[key];
      });

      done();
    });
  });

  describe('with no document params', function () {
    var ids = [];

    it('should clear all models from DB', function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document with arity of 2', function (done) {
      BlogAnon.createDoc(blogData, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogData.blog);
        expect(blog.__v).toBeDefined();
        ids.push(blog.id);
        done();
      });
    });

    it('`createDoc` should create a new document with arity of 3', function (done) {
      BlogAnon.createDoc(blogData, {}, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogData.blog);
        expect(blog.__v).toBeDefined();
        ids.push(blog.id);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 1', function (done) {
      BlogAnon.readDocs(function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(2);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 2', function (done) {
      BlogAnon.readDocs({}, function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(2);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 2', function (done) {
      BlogAnon.readDocById(ids[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3', function (done) {
      BlogAnon.readDocById(ids[1], {}, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 3', function (done) {
      BlogAnon.patchDocById(ids[0], blogPatch, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogPatch.blog);
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 4', function (done) {
      BlogAnon.patchDocById(ids[1], blogPatch, {}, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogPatch.blog);
        done();
      });
    });

    it('`destroyDocById` should destroy an existing document with arity of 2', function (done) {
      BlogAnon.destroyDocById(ids[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        done();
      });
    });
  });

  describe('with document owner/group restrictions', function () {
    var ids = [];

    it('should clear all models from DB', function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document with owner fooUser', function (done) {
      Blog.createDoc(blogDataOwners.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogData.blog);
        expect(blog.__v).toBeDefined();
        ids.push(blog.id);
        done();
      });
    });

    it('`createDoc` should create a new document with owner barUser', function (done) {
      Blog.createDoc(blogDataOwners.barUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogData.blog);
        expect(blog.__v).toBeDefined();
        ids.push(blog.id);
        done();
      });
    });

    it('`createDoc` should create a new document with owner foobarUser', function (done) {
      Blog.createDoc(blogDataOwners.foobarUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogData.blog);
        expect(blog.__v).toBeDefined();
        ids.push(blog.id);
        done();
      });
    });

    // Show no default owner/group management in plugin
    it('`readDocs` should fetch a list of documents with arity of 1 and no owner/group', function (done) {
      Blog.readDocs(function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(3);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 2 and correct document owner/group', function (done) {
      Blog.readDocs(ownerGroupChecks.fooUser, function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(3);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 2 and correct document owner', function (done) {
      Blog.readDocs(ownerGroupChecks.barUser, function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(2);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 2 and correct document owner', function (done) {
      Blog.readDocs(ownerGroupChecks.foobarUser, function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(1);
        expect(blogs[0].id).toBe(ids[2]);
        done();
      });
    });

    // Proves no default owner/group management in plugin
    it('`readDocById` should fetch a document with arity of 2 and no owner', function (done) {
      Blog.readDocById(ids[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        done();
      });
    });

    it('`readDocById` should not fetch a document with arity of 3 and wrong document owner/group', function (done) {
      Blog.readDocById(ids[0], ownerGroupChecks.barUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });

    it('`readDocById` should not fetch a document with arity of 3 and wrong document owner/group', function (done) {
      Blog.readDocById(ids[0], ownerGroupChecks.barUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3 and correct document owner/group', function (done) {
      Blog.readDocById(ids[0], ownerGroupChecks.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3 and correct group', function (done) {
      Blog.readDocById(ids[1], ownerGroupChecks.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3 and correct group', function (done) {
      Blog.readDocById(ids[1], ownerGroupChecks.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        done();
      });
    });

    it('`patchDocById` should not patch an existing document with arity of 4 and wrong document owner', function (done) {
      Blog.patchDocById(ids[0], blogPatch, ownerChecks.barUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 4 and correct document owner', function (done) {
      Blog.patchDocById(ids[0], blogPatch, ownerChecks.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogPatch.blog);
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 5 and correct document owner', function (done) {
      Blog.patchDocById(ids[1], blogPatch, ownerChecks.barUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogPatch.blog);
        done();
      });
    });

    it('`destroyDocById` should destroy an existing document with arity of 3 and correct document owner', function (done) {
      Blog.destroyDocById(ids[0], ownerChecks.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        done();
      });
    });

    it('`destroyDocById` should not destroy an existing document with arity of 3 and wrong document owner', function (done) {
      Blog.destroyDocById(ids[1], ownerChecks.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });
  });

  describe('with document params', function () {
    var ids = [];

    it('should clear all models from DB', function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document with selected and populated fields', function (done) {
      Blog.createDoc(blogDataOwners.fooUser, params, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        expect(blog.title).toBe(blogData.title);
        expect(blog.blog).toBe(blogData.blog);
        expect(blog.comments).toBeUndefined();
        expect(blog.__v).toBeUndefined();
        expect(blog.created.by).toEqual(jasmine.any(Object));
        expect(blog.created.by.displayName).toBe(users.fooUser.displayName);
        ids.push(blog.id);
        done();
      });
    });

    it('`readDocById` should fetch a document with selected and populated fields', function (done) {
      Blog.readDocById(ids[0], _.merge({}, params, ownerGroupChecks.fooUser), function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        expect(blog.title).toBe(blogData.title);
        expect(blog.blog).toBe(blogData.blog);
        expect(blog.comments).toBeUndefined();
        expect(blog.__v).toBeUndefined();
        expect(blog.created.by).toEqual(jasmine.any(Object));
        expect(blog.created.by.displayName).toBe(users.fooUser.displayName);
        done();
      });
    });
  });

  describe('with document paging params', function () {
    var blogDocs = [];
    var docsSortedByDate;
    var docsSortedByDateReversed;
    var pagingParams = {
      sort: '_id',
      limit: 5
    };

    it('should clear all models from DB', function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    it('should create a collection', function (done) {
      BlogAnon.create(Array(20).join('.').split('.').map(function (v, i) {
        // Ensure create dates are unique
        return {title: 'This is blog ' + i, created: {date: (new Date()).setMilliseconds(i)}};
      }), function (err) {
        blogDocs = [].slice.call(arguments, 1);

        docsSortedByDate = blogDocs.sort(function (a, b) {
          return a.created.date - b.created.date;
        });

        // reverse() modifies the array directly so we use a map to create a new array
        docsSortedByDateReversed = docsSortedByDate.map(function (v) {return v;}).reverse();
        done();
      });
    });

    describe('sorted by `_id`', function () {
      var ids = [];

      it('should return first 5 records', function (done) {
        BlogAnon.readDocs(pagingParams, function (err, blogs) {
          expect(blogs.length).toBe(5);

          blogs.forEach(function (blog, i) {
            ids.push(blog.id);
            expect(blogDocs[i].id).toBe(blog.id);
          });
          done();
        });
      });

      it('should return next 5 records with skip', function (done) {
        BlogAnon.readDocs(_.merge({}, pagingParams, {skip: 5}), function (err, blogs) {
          expect(blogs.length).toBe(5);

          blogs.forEach(function (blog, i) {
            ids.push(blog.id);
            expect(blogDocs[i + 5].id).toBe(blog.id);
          });

          // unique check
          expect(isUniq(ids)).toBe(true);
          done();
        });
      });
    });

    describe('sorted by `created.date`', function () {
      var ids = [];

      it('should return first 5 records', function (done) {
        BlogAnon.readDocs(_.merge({}, pagingParams, {sort: 'created.date'}), function (err, blogs) {
          expect(blogs.length).toBe(5);

          blogs.forEach(function (blog, i) {
            ids.push(blog.id);
            expect(docsSortedByDate[i].id).toBe(blog.id);
          });
          done();
        });
      });

      it('should return next 5 records with skip sorted by created.date', function (done) {
        BlogAnon.readDocs(_.merge({}, pagingParams, {sort: 'created.date', skip: 5}), function (err, blogs) {
          expect(blogs.length).toBe(5);

          blogs.forEach(function (blog, i) {
            ids.push(blog.id);
            expect(docsSortedByDate[i + 5].id).toBe(blog.id);
          });

          // unique check
          expect(isUniq(ids)).toBe(true);
          done();
        });
      });
    });

    describe('sorted by `-created.date`', function () {
      var ids = [];

      it('should return newest 5 records', function (done) {
        BlogAnon.readDocs(_.merge({}, pagingParams, {sort: '-created.date'}), function (err, blogs) {
          expect(blogs.length).toBe(5);

          blogs.forEach(function (blog, i) {
            ids.push(blog.id);
            expect(docsSortedByDateReversed[i].id).toBe(blog.id);
          });
          done();
        });
      });

      it('should return next newest 5 records with range', function (done) {
        var lastDoc = blogDocs.filter(function (blog) {
          return blog.id === ids[ids.length - 1];
        })[0];

        BlogAnon.readDocs(_.merge({}, pagingParams, {sort: '-created.date', skip: { operator: 'lt', path: 'created.date', val: lastDoc.created.date}}), function (err, blogs) {
          expect(blogs.length).toBe(5);

          blogs.forEach(function (blog, i) {
            ids.push(blog.id);
            expect(docsSortedByDateReversed[i + 5].id).toBe(blog.id);
          });

          // unique check
          expect(isUniq(ids)).toBe(true);
          done();
        });
      });
    });
  });

  describe('with subdocument collections', function () {
    var subdocParams = {};
    var blogIds = [];
    var commentIds = [];

    it('should clear all documents from DB', function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document', function (done) {
      BlogAnon.createDoc(blogData, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 4', function (done) {
      BlogAnon.createCollDoc(blogIds[0], 'comments', {body: 'This is my comment'}, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe('This is my comment');
        commentIds.push(comment.id);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 5', function (done) {
      BlogAnon.createCollDoc(blogIds[0], 'comments', {body: 'This is my other comment'}, subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe('This is my other comment');
        commentIds.push(comment.id);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 3', function (done) {
      BlogAnon.readCollDocs(blogIds[0], 'comments', function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(2);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 4', function (done) {
      BlogAnon.readCollDocs(blogIds[0], 'comments', subdocParams, function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(2);
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 4', function (done) {
      BlogAnon.readCollDocById(blogIds[0], 'comments', commentIds[0], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        expect(comment.body).toBe('This is my comment');
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 5', function (done) {
      BlogAnon.readCollDocById(blogIds[0], 'comments', commentIds[1], subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[1]);
        expect(comment.body).toBe('This is my other comment');
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 5', function (done) {
      BlogAnon.patchCollDocById(blogIds[0], 'comments', commentIds[0], {body: 'This is my update'}, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        expect(comment.body).toBe('This is my update');
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 6', function (done) {
      BlogAnon.patchCollDocById(blogIds[0], 'comments', commentIds[1], {body: 'This is my other update'}, subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[1]);
        expect(comment.body).toBe('This is my other update');
        done();
      });
    });

    it('`destroyCollDocById` should destroy an existing subdocument with arity of 4', function (done) {
      BlogAnon.destroyCollDocById(blogIds[0], 'comments', commentIds[0], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        done();
      });
    });

    it('`destroyCollDocById` should destroy an existing subdocument with arity of 5', function (done) {
      BlogAnon.destroyCollDocById(blogIds[0], 'comments', commentIds[1], params, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[1]);
        done();
      });
    });
  });

  describe('with subdocument collections and owner/group restrictions', function () {
    var blogIds = [];
    var commentIds = [];

    it('should clear all documents from DB', function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document', function (done) {
      Blog.createDoc(blogDataOwners.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createDoc` should create a new document', function (done) {
      Blog.createDoc(blogDataOwners.barUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createCollDoc` should not create a new subdocument with arity of 5 and wrong document owner/group', function (done) {
      Blog.createCollDoc(blogIds[0], 'comments', {body: 'This is my comment', created: {by: users.barUser}}, ownerGroupChecks.barUser, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 5 and correct document owner', function (done) {
      Blog.createCollDoc(blogIds[0], 'comments', {body: 'This is my comment', created: {by: users.fooUser}}, ownerGroupChecks.fooUser, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe('This is my comment');
        commentIds.push(comment.id);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 5 and correct document owner/group', function (done) {
      Blog.createCollDoc(blogIds[1], 'comments', {body: 'This is my comment', created: {by: users.fooUser}}, ownerGroupChecks.fooUser, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe('This is my comment');
        commentIds.push(comment.id);
        done();
      });
    });

    it('`readCollDocs` should not fetch subdocuments with arity of 4 and wrong document owner/group', function (done) {
      Blog.readCollDocs(blogIds[0], 'comments', ownerGroupChecks.barUser, function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toBe(null);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 4 and correct document owner', function (done) {
      Blog.readCollDocs(blogIds[0], 'comments', ownerGroupChecks.fooUser, function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(1);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 4 and correct document owner/group', function (done) {
      Blog.readCollDocs(blogIds[1], 'comments', ownerGroupChecks.fooUser, function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(1);
        done();
      });
    });

    it('`readCollDocById` should not fetch subdocuments with arity of 5 and wrong document owner/group', function (done) {
      Blog.readCollDocById(blogIds[0], 'comments', commentIds[0], ownerGroupChecks.barUser, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 5', function (done) {
      Blog.readCollDocById(blogIds[0], 'comments', commentIds[0], ownerGroupChecks.fooUser, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        expect(comment.body).toBe('This is my comment');
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 5', function (done) {
      Blog.readCollDocById(blogIds[1], 'comments', commentIds[1], ownerGroupChecks.fooUser, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[1]);
        expect(comment.body).toBe('This is my comment');
        done();
      });
    });

    it('`patchCollDocById` should not patch subdocument with arity of 6 with wrong document owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.barUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.barUser);

      Blog.patchCollDocById(blogIds[0], 'comments', commentIds[0], {body: 'This is my update'}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`patchCollDocById` should not patch subdocument with arity of 6 with wrong subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.barUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.barUser);

      Blog.patchCollDocById(blogIds[1], 'comments', commentIds[0], {body: 'This is my update'}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 6 with correct subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.fooUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.fooUser);

      Blog.patchCollDocById(blogIds[0], 'comments', commentIds[0], {body: 'This is my update'}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        expect(comment.body).toBe('This is my update');
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 6 with correct subdocumet owner/group', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.fooUser, 'comments._id': commentIds[1]}}, ownerGroupChecks.fooUser);

      Blog.patchCollDocById(blogIds[1], 'comments', commentIds[1], {body: 'This is my other update'}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[1]);
        expect(comment.body).toBe('This is my other update');
        done();
      });
    });

    it('`destroyCollDocById` should not destroy subdocument with arity of 5 with wrong document owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.barUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.barUser);

      Blog.destroyCollDocById(blogIds[0], 'comments', commentIds[0], collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`destroyCollDocById` should not destroy subdocument with arity of 5 with wrong subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.barUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.barUser);

      Blog.destroyCollDocById(blogIds[1], 'comments', commentIds[0], collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`destroyCollDocById` should destroy subdocument with arity of 5 with correct subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.fooUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.fooUser);

      Blog.destroyCollDocById(blogIds[0], 'comments', commentIds[0], collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        done();
      });
    });

    it('`destroyCollDocById` should destroy subdocument with arity of 5 with correct subdocumet owner/group', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users.fooUser, 'comments._id': commentIds[1]}}, ownerGroupChecks.fooUser);

      Blog.destroyCollDocById(blogIds[1], 'comments', commentIds[1], collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[1]);
        done();
      });
    });
  });

  describe('with subdocument collection params', function () {
    var blogIds = [];
    var commentIds = [];
    var subdocParams = {
      select: 'comments.id comments.body comments.created.by',
      populate: [{path: 'comments.created.by', ref: 'User', select: 'displayName'}]
    };

    it('should clear all models from DB', function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('should clear all documents from DB', function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document', function (done) {
      Blog.createDoc(blogDataOwners.fooUser, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBeDefined();
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, ownerGroupChecks.fooUser);

      Blog.createCollDoc(blogIds[0], 'comments', {body: 'This is my comment', created: {by: users.fooUser}}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe('This is my comment');
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users.fooUser.displayName);
        commentIds.push(comment.id);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, ownerGroupChecks.fooUser);

      Blog.readCollDocs(blogIds[0], 'comments', collParams, function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(1);
        expect(comments[0].id).toBe(commentIds[0]);
        expect(comments[0].body).toBe('This is my comment');
        expect(comments[0].__v).toBeUndefined();
        expect(comments[0].created.by).toEqual(jasmine.any(Object));
        expect(comments[0].created.by.displayName).toBe(users.fooUser.displayName);
        done();
      });
    });

    it('`readCollDocById` should fetch a subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, ownerGroupChecks.fooUser);

      Blog.readCollDocById(blogIds[0], 'comments', commentIds[0], collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        expect(comment.body).toBe('This is my comment');
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users.fooUser.displayName);
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, {where: {'comments.created.by': users.fooUser, 'comments._id': commentIds[0]}}, ownerGroupChecks.fooUser);

      Blog.patchCollDocById(blogIds[0], 'comments', commentIds[0], {body: 'This is my update'}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(commentIds[0]);
        expect(comment.body).toBe('This is my update');
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users.fooUser.displayName);
        done();
      });
    });
  });

  xdescribe('with subdocument paging params', function () {
    var blogDoc;
    var commentDocs = [];
    var commentIds = [];
    var subDocsSortedByDate;
    var subDocsSortedByDateReversed;
    var pagingParams = {
      limit: 5
    };

    it('should clear all models from DB', function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document', function (done) {
      BlogAnon.createDoc({title: 'This is a blog with a lot of comments'}, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        blogDoc = blog;
        done();
      });
    });

    Array(20).join('.').split('.').map(function (v, i) {
      it('should create a subdocument', function (done) {
        BlogAnon.createCollDoc(blogDoc.id, 'comments', {title: 'This is comment ' + i, created: {date: (new Date()).setMilliseconds(i)}}, function (err, comment) {
          expect(comment).toEqual(jasmine.any(Object));

          commentDocs.push(comment);
          done();
        });
      });
    });

    it('should sort comments', function () {
      expect(commentDocs.length).toBe(20);

      subDocsSortedByDate = commentDocs.sort(function (a, b) {
        return a.created.date - b.created.date;
      });

      // reverse() modifies the array directly so we use a map to create a new array
      subDocsSortedByDateReversed = subDocsSortedByDate.map(function (v) {return v;}).reverse();
    });

    it('should return first 5 records', function (done) {
      BlogAnon.readCollDocs(blogDoc.id, pagingParams, function (err, comments) {
        expect(comments.length).toBe(5);

        comments.forEach(function (comment, i) {
          commentIds.push(comment.id);
          expect(commentDocs[i].id).toBe(comment.id);
        });
        done();
      });
    });

    it('should return next 5 records with skip', function (done) {
      BlogAnon.readCollDocs(blogDoc.id, _.merge({}, pagingParams, {skip: 5}), function (err, comments) {
        expect(comments.length).toBe(5);

        comments.forEach(function (comment, i) {
          commentIds.push(comment.id);
          expect(commentDocs[i + 5].id).toBe(comment.id);
        });

        // unique check
        expect(isUniq(commentIds)).toBe(true);
        done();
      });
    });
  });
});

function isUniq(arr) {
  return !arr.some(function (val, i, arr) {
    return arr.indexOf(val, ++i) > -1;
  });
}

function model(name, schema) {
  if (arguments.length === 1) {
    schema = name;
    name = 'Model';
  }

  // Specifying a collection name allows the model to be overwritten in
  // Mongoose's model cache
  return connection.model(name, schema, name);
}

function BlogAnonSchema() {
  var commentSchema = CommentSchema();
  var blogAnonSchema = Schema({
    title: String,
    blog: String,
    created: {
      date: {
        type: Date,
        default: Date.now
      }
    },
    comments: [commentSchema]
  });

  blogAnonSchema.set('toJSON', {getters: true, virtuals: true});
  return blogAnonSchema;
}

function BlogSchema() {
  var blogSchema = BlogAnonSchema();
  blogSchema.add({
    created: {
      by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    },
    readers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }]
  });

  blogSchema.set('toJSON', {getters: true, virtuals: true});
  return blogSchema;
}

function CommentSchema() {
  var commentSchema = Schema({
    body: String,
    created: {
      by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  });

  commentSchema.set('toJSON', {getters: true, virtuals: true});
  return commentSchema;
}

function UserSchema() {
  var userSchema = Schema({
    displayName: String
  });

  userSchema.set('toJSON', {getters: true, virtuals: true});
  return userSchema;
}
