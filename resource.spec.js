var mongoose = require('mongoose');
var _ = require('lodash-node/modern');
var async = require('async');
var faker = require('faker');
var resource = require('./resource');
var Schema = mongoose.Schema;
var connection;

// Test data
var blogData = {
  title: faker.lorem.sentence(),
  blog: faker.lorem.paragraphs()
};
var blogPatch = {
  blog: faker.lorem.paragraphs()
};
var users;
var params = {
  select: 'title blog created.by readers',
  populate: [
    {path: 'created.by', select: 'displayName'},
    {path: 'readers', select: 'displayName'}
  ]
};

describe('Mongoose plugin: resource', function () {
  var Blog;
  var BlogAnon;
  var blogDataOwners;
  var ownerChecks;
  var ownerGroupChecks;

  beforeAll(function (done) {
    mongoose.set('debug', process.env.DEBUG || false);

    connection = mongoose.createConnection('mongodb://localhost/unit_test');
    connection.once('connected', done);
  });

  afterAll(function (done) {
    connection.db.dropDatabase(function (err, result) {
      connection.close(done);
    });
  });

  // Create test users
  beforeAll(function (done) {
    var User = model('User', UserSchema());

    User.create(Array(3).join('.').split('.').map(function () {
      return {displayName: faker.name.findName()};
    }), function (err, usersArray) {
      users = usersArray;

      blogDataOwners = [
        {created: {by: users[0].id}},
        {created: {by: users[1].id}, readers: [users[0].id]},
        {created: {by: users[2].id}, readers: [users[0].id, users[1].id]}
      ];
      ownerChecks = [
        {where: {'created.by': users[0].id}},
        {where: {'created.by': users[1].id}},
        {where: {'created.by': users[2].id}}
      ];
      ownerGroupChecks = [
        {where: {$or: [{'created.by': users[0].id}, {'readers': users[0].id}]}},
        {where: {$or: [{'created.by': users[1].id}, {'readers': users[1].id}]}},
        {where: {$or: [{'created.by': users[2].id}, {'readers': users[2].id}]}}
      ];

      Object.keys(blogData).forEach(function (key) {
        blogDataOwners[0][key] = blogData[key];
        blogDataOwners[1][key] = blogData[key];
        blogDataOwners[2][key] = blogData[key];
      });

      done();
    });
  });

  it('should compile the models with the resource plugin', function (done) {
    var schema = BlogSchema();
    var anonSchema = BlogAnonSchema();
    schema.plugin(resource);
    anonSchema.plugin(resource);

    expect(Object.keys(schema.statics).sort()).toEqual([
      'createCollDoc',
      'createDoc',
      'destroyCollDocById',
      'destroyDocById',
      'patchCollDocById',
      'patchDocById',
      'readCollDocById',
      'readCollDocs',
      'readDocById',
      'readDocs'
    ]);

    Blog = model('Blog', schema);
    BlogAnon = model('BlogAnon', anonSchema);

    expect(Blog).toEqual(jasmine.any(Function));
    expect(BlogAnon).toEqual(jasmine.any(Function));

    done();
  });

  describe('with document', function () {
    var ids = [];

    beforeAll(function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should not create a new document without required fields', function (done) {
      BlogAnon.createDoc({}, function (err, blog) {
        expect(err).not.toBe(null);
        expect(Object.keys(err.errors).sort()).toEqual(['title']);
        expect(blog).toBeUndefined();
        done();
      });
    });

    it('`createDoc` should create a new document with arity of 2', function (done) {
      BlogAnon.createDoc(blogData, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blog))).sort()).toEqual([
          '__v',
          '_id',
          'blog',
          'id',
          'tags',
          'title'
        ]);

        expect(blog.id).toBeDefined();
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogData.blog);
        expect(blog.tags).toEqual(blogData.blog.split(' ').splice(0,3));
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

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blogs[0]))).sort()).toEqual([
          '__v',
          '_id',
          'blog',
          'id',
          'tags',
          'title'
        ]);

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

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blog))).sort()).toEqual([
          '__v',
          '_id',
          'blog',
          'id',
          'tags',
          'title'
        ]);

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

    it('`patchDocById` should not patch an existing document without required fields', function (done) {
      BlogAnon.patchDocById(ids[0], {title: undefined}, function (err, blog) {
        expect(err).not.toBe(null);
        expect(Object.keys(err.errors).sort()).toEqual(['title']);
        expect(blog).toBeUndefined();
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 3', function (done) {
      BlogAnon.patchDocById(ids[0], blogPatch, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blog))).sort()).toEqual([
          '__v',
          '_id',
          'blog',
          'id',
          'tags',
          'title'
        ]);

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

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blog))).sort()).toEqual([
          '__v',
          '_id',
          'blog',
          'id',
          'tags',
          'title'
        ]);

        done();
      });
    });
  });

  describe('with document owner/group restrictions', function () {
    var ids = [];

    beforeAll(function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document with an owner', function (done) {
      Blog.createDoc(blogDataOwners[0], function (err, blog) {
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

    it('`createDoc` should create a new document with another owner', function (done) {
      Blog.createDoc(blogDataOwners[1], function (err, blog) {
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

    it('`createDoc` should create a new document with owner', function (done) {
      Blog.createDoc(blogDataOwners[2], function (err, blog) {
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
      Blog.readDocs(ownerGroupChecks[0], function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(3);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 2 and correct document owner', function (done) {
      Blog.readDocs(ownerGroupChecks[1], function (err, blogs) {
        expect(err).toBe(null);
        expect(blogs).toEqual(jasmine.any(Array));
        expect(blogs.length).toBe(2);
        done();
      });
    });

    it('`readDocs` should fetch a list of documents with arity of 2 and correct document owner', function (done) {
      Blog.readDocs(ownerGroupChecks[2], function (err, blogs) {
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
      Blog.readDocById(ids[0], ownerGroupChecks[1], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });

    it('`readDocById` should not fetch a document with arity of 3 and wrong document owner/group', function (done) {
      Blog.readDocById(ids[0], ownerGroupChecks[1], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3 and correct document owner/group', function (done) {
      Blog.readDocById(ids[0], ownerGroupChecks[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3 and correct group', function (done) {
      Blog.readDocById(ids[1], ownerGroupChecks[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        done();
      });
    });

    it('`readDocById` should fetch a document with arity of 3 and correct group', function (done) {
      Blog.readDocById(ids[1], ownerGroupChecks[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        done();
      });
    });

    it('`patchDocById` should not patch an existing document with arity of 4 and wrong document owner', function (done) {
      Blog.patchDocById(ids[0], blogPatch, ownerChecks[1], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 4 and correct document owner', function (done) {
      Blog.patchDocById(ids[0], blogPatch, ownerChecks[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[0]);
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogPatch.blog);
        done();
      });
    });

    it('`patchDocById` should patch an existing document with arity of 5 and correct document owner', function (done) {
      Blog.patchDocById(ids[1], blogPatch, ownerChecks[1], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        expect(blog.id).toBe(ids[1]);
        expect(blog.title).toEqual(blogData.title);
        expect(blog.blog).toEqual(blogPatch.blog);
        done();
      });
    });

    it('`destroyDocById` should destroy an existing document with arity of 3 and correct document owner', function (done) {
      Blog.destroyDocById(ids[0], ownerChecks[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));
        done();
      });
    });

    it('`destroyDocById` should not destroy an existing document with arity of 3 and wrong document owner', function (done) {
      Blog.destroyDocById(ids[1], ownerChecks[0], function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toBe(null);
        done();
      });
    });
  });

  describe('with document params', function () {
    var ids = [];

    beforeAll(function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    it('`createDoc` should create a new document with selected and populated fields', function (done) {
      Blog.createDoc(blogDataOwners[0], params, function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blog))).sort()).toEqual([
          '_id',
          'blog',
          'created',
          'id',
          'readers',
          'tags',
          'title'
        ]);

        expect(blog.id).toBeDefined();
        expect(blog.title).toBe(blogData.title);
        expect(blog.blog).toBe(blogData.blog);
        expect(blog.comments).toBeUndefined();
        expect(blog.__v).toBeUndefined();
        expect(blog.created.by).toEqual(jasmine.any(Object));
        expect(blog.created.by.displayName).toBe(users[0].displayName);
        ids.push(blog.id);
        done();
      });
    });

    it('`readDocById` should fetch a document with selected and populated fields', function (done) {
      Blog.readDocById(ids[0], _.merge({}, params, ownerGroupChecks[0]), function (err, blog) {
        expect(err).toBe(null);
        expect(blog).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        expect(Object.keys(JSON.parse(JSON.stringify(blog))).sort()).toEqual([
          '_id',
          'blog',
          'created',
          'id',
          'readers',
          'tags',
          'title'
        ]);

        expect(blog.id).toBe(ids[0]);
        expect(blog.title).toBe(blogData.title);
        expect(blog.blog).toBe(blogData.blog);
        expect(blog.comments).toBeUndefined();
        expect(blog.__v).toBeUndefined();
        expect(blog.created.by).toEqual(jasmine.any(Object));
        expect(blog.created.by.displayName).toBe(users[0].displayName);
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

    beforeAll(function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    // create test collection
    beforeAll(function (done) {
      BlogAnon.create(Array(20).join('.').split('.').map(function (v, i) {
        // Ensure create dates are unique
        return {title: 'This is blog ' + i, created: {date: (new Date()).setMilliseconds(i)}};
      }), function (err, docs) {
        blogDocs = docs;
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
    var comments = [];

    beforeAll(function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    // create parent doc
    beforeAll(function (done) {
      BlogAnon.createDoc(blogData, function (err, blog) {
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createCollDoc` should not create a new subdocument without required fields', function (done) {
      var text = faker.lorem.paragraph();

      BlogAnon.createCollDoc(blogIds[0], 'comments', {}, function (err, comment) {
        expect(err).not.toBe(null);
        expect(Object.keys(err.errors).sort()).toEqual(['comments.0.body']);
        expect(comment).toBeUndefined();
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 4', function (done) {
      var text = faker.lorem.paragraph();

      BlogAnon.createCollDoc(blogIds[0], 'comments', {body: text}, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'id',
        //  'tags'
        //]);

        expect(comment.id).toBeDefined();
        expect(comment.body).toBe(text);
        expect(comment.tags).toEqual(text.split(' ').splice(0,3));
        comments.push(comment);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 5', function (done) {
      var text = faker.lorem.paragraph();

      BlogAnon.createCollDoc(blogIds[0], 'comments', {body: text}, subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe(text);
        comments.push(comment);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 3', function (done) {
      BlogAnon.readCollDocs(blogIds[0], 'comments', function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comments[0]))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'id',
        //  'tags'
        //]);

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
      BlogAnon.readCollDocById(blogIds[0], 'comments', comments[0].id, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'id',
        //  'tags'
        //]);

        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(comments[0].body);
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 5', function (done) {
      BlogAnon.readCollDocById(blogIds[0], 'comments', comments[1].id, subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[1].id);
        expect(comment.body).toBe(comments[1].body);
        done();
      });
    });

    it('`patchCollDocById` should not patch subdocument without required fields', function (done) {
      BlogAnon.patchCollDocById(blogIds[0], 'comments', comments[0].id, {body: undefined}, function (err, comment) {
        expect(err).not.toBe(null);
        expect(Object.keys(err.errors).sort()).toEqual(['comments.0.body']);
        expect(comment).toBeUndefined();
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 5', function (done) {
      var text = faker.lorem.paragraph();

      BlogAnon.patchCollDocById(blogIds[0], 'comments', comments[0].id, {body: text}, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'id',
        //  'tags'
        //]);

        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(text);
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 6', function (done) {
      var text = faker.lorem.paragraph();

      BlogAnon.patchCollDocById(blogIds[0], 'comments', comments[1].id, {body: text}, subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[1].id);
        expect(comment.body).toBe(text);
        done();
      });
    });

    it('`destroyCollDocById` should destroy an existing subdocument with arity of 4', function (done) {
      BlogAnon.destroyCollDocById(blogIds[0], 'comments', comments[0].id, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'id',
        //  'tags'
        //]);

        expect(comment.id).toBe(comments[0].id);
        done();
      });
    });

    it('`destroyCollDocById` should destroy an existing subdocument with arity of 5', function (done) {
      BlogAnon.destroyCollDocById(blogIds[0], 'comments', comments[1].id, subdocParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[1].id);
        done();
      });
    });
  });

  describe('with subdocument collections and owner/group restrictions', function () {
    var blogIds = [];
    var comments = [];

    beforeAll(function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    // create parent doc 1
    beforeAll(function (done) {
      Blog.createDoc(blogDataOwners[0], function (err, blog) {
        blogIds.push(blog.id);
        done();
      });
    });

    // create parent doc 2
    beforeAll(function (done) {
      Blog.createDoc(blogDataOwners[1], function (err, blog) {
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createCollDoc` should not create a new subdocument with arity of 5 and wrong document owner/group', function (done) {
      var text = faker.lorem.paragraph();

      Blog.createCollDoc(blogIds[0], 'comments', {body: text, created: {by: users[1]}}, ownerGroupChecks[1], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 5 and correct document owner', function (done) {
      var text = faker.lorem.paragraph();

      Blog.createCollDoc(blogIds[0], 'comments', {body: text, created: {by: users[0]}}, ownerGroupChecks[0], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe(text);
        comments.push(comment);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with arity of 5 and correct document owner/group', function (done) {
      var text = faker.lorem.paragraph();

      Blog.createCollDoc(blogIds[1], 'comments', {body: text, created: {by: users[0]}}, ownerGroupChecks[0], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBeDefined();
        expect(comment.body).toBe(text);
        comments.push(comment);
        done();
      });
    });

    it('`readCollDocs` should not fetch subdocuments with arity of 4 and wrong document owner/group', function (done) {
      Blog.readCollDocs(blogIds[0], 'comments', ownerGroupChecks[1], function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toBe(null);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 4 and correct document owner', function (done) {
      Blog.readCollDocs(blogIds[0], 'comments', ownerGroupChecks[0], function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(1);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with arity of 4 and correct document owner/group', function (done) {
      Blog.readCollDocs(blogIds[1], 'comments', ownerGroupChecks[0], function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));
        expect(comments.length).toBe(1);
        done();
      });
    });

    it('`readCollDocById` should not fetch subdocuments with arity of 5 and wrong document owner/group', function (done) {
      Blog.readCollDocById(blogIds[0], 'comments', comments[0].id, ownerGroupChecks[1], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 5', function (done) {
      Blog.readCollDocById(blogIds[0], 'comments', comments[0].id, ownerGroupChecks[0], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(comments[0].body);
        done();
      });
    });

    it('`readCollDocById` should fetch subdocuments with arity of 5', function (done) {
      Blog.readCollDocById(blogIds[1], 'comments', comments[1].id, ownerGroupChecks[0], function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[1].id);
        expect(comment.body).toBe(comments[1].body);
        done();
      });
    });

    it('`patchCollDocById` should not patch subdocument with arity of 6 with wrong document owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[1], 'comments._id': comments[0].id}}, ownerGroupChecks[1]);
      var text = faker.lorem.paragraph();

      Blog.patchCollDocById(blogIds[0], 'comments', comments[0].id, {body: text}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`patchCollDocById` should not patch subdocument with arity of 6 with wrong subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[1], 'comments._id': comments[0].id}}, ownerGroupChecks[1]);
      var text = faker.lorem.paragraph();

      Blog.patchCollDocById(blogIds[1], 'comments', comments[0].id, {body: text}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 6 with correct subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[0], 'comments._id': comments[0].id}}, ownerGroupChecks[0]);
      var text = faker.lorem.paragraph();

      Blog.patchCollDocById(blogIds[0], 'comments', comments[0].id, {body: text}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(text);
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with arity of 6 with correct subdocumet owner/group', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[0], 'comments._id': comments[1].id}}, ownerGroupChecks[0]);
      var text = faker.lorem.paragraph();

      Blog.patchCollDocById(blogIds[1], 'comments', comments[1].id, {body: text}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[1].id);
        expect(comment.body).toBe(text);
        done();
      });
    });

    it('`destroyCollDocById` should not destroy subdocument with arity of 5 with wrong document owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[1], 'comments._id': comments[0].id}}, ownerGroupChecks[1]);

      Blog.destroyCollDocById(blogIds[0], 'comments', comments[0].id, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`destroyCollDocById` should not destroy subdocument with arity of 5 with wrong subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[1], 'comments._id': comments[0].id}}, ownerGroupChecks[1]);

      Blog.destroyCollDocById(blogIds[1], 'comments', comments[0].id, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toBe(null);
        done();
      });
    });

    it('`destroyCollDocById` should destroy subdocument with arity of 5 with correct subdocumet owner', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[0], 'comments._id': comments[0].id}}, ownerGroupChecks[0]);

      Blog.destroyCollDocById(blogIds[0], 'comments', comments[0].id, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[0].id);
        done();
      });
    });

    it('`destroyCollDocById` should destroy subdocument with arity of 5 with correct subdocumet owner/group', function (done) {
      var collParams = _.merge({}, {where: {'comments.created.by': users[0], 'comments._id': comments[1].id}}, ownerGroupChecks[0]);

      Blog.destroyCollDocById(blogIds[1], 'comments', comments[1].id, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));
        expect(comment.id).toBe(comments[1].id);
        done();
      });
    });
  });

  describe('with subdocument collection params', function () {
    var blogIds = [];
    var comments = [];
    var subdocParams = {
      select: 'comments.id comments.body comments.created.by',
      populate: [{path: 'comments.created.by', ref: 'User', select: 'displayName'}]
    };

    beforeAll(function (done) {
      Blog.collection.remove(function () {
        done();
      });
    });

    // create parent doc
    beforeAll(function (done) {
      Blog.createDoc(blogDataOwners[0], function (err, blog) {
        blogIds.push(blog.id);
        done();
      });
    });

    it('`createCollDoc` should create a new subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, ownerGroupChecks[0]);
      var text = faker.lorem.paragraph();

      Blog.createCollDoc(blogIds[0], 'comments', {body: text, created: {by: users[0]}}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'created',
        //  'id'
        //]);

        expect(comment.id).toBeDefined();
        expect(comment.body).toBe(text);
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users[0].displayName);
        comments.push(comment);
        done();
      });
    });

    it('`readCollDocs` should fetch subdocuments with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, ownerGroupChecks[0]);

      Blog.readCollDocs(blogIds[0], 'comments', collParams, function (err, comments) {
        expect(err).toBe(null);
        expect(comments).toEqual(jasmine.any(Array));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comments[0]))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'created',
        //  'id'
        //]);

        expect(comments.length).toBe(1);
        expect(comments[0].id).toBe(comments[0].id);
        expect(comments[0].body).toBe(comments[0].body);
        expect(comments[0].__v).toBeUndefined();
        expect(comments[0].created.by).toEqual(jasmine.any(Object));
        expect(comments[0].created.by.displayName).toBe(users[0].displayName);
        done();
      });
    });

    it('`readCollDocById` should fetch a subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, ownerGroupChecks[0]);

      Blog.readCollDocById(blogIds[0], 'comments', comments[0].id, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'created',
        //  'id'
        //]);

        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(comments[0].body);
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users[0].displayName);
        done();
      });
    });

    it('`patchCollDocById` should patch subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, {where: {'comments.created.by': users[0], 'comments._id': comments[0].id}}, ownerGroupChecks[0]);
      var text = faker.lorem.paragraph();

      Blog.patchCollDocById(blogIds[0], 'comments', comments[0].id, {body: text}, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'created',
        //  'id'
        //]);

        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(text);
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users[0].displayName);
        comments[0] = comment;
        done();
      });
    });

    it('`destroyCollDocById` should patch subdocument with selected and populated fields', function (done) {
      var collParams = _.merge({}, subdocParams, {where: {'comments.created.by': users[0], 'comments._id': comments[0].id}}, ownerGroupChecks[0]);

      Blog.destroyCollDocById(blogIds[0], 'comments', comments[0].id, collParams, function (err, comment) {
        expect(err).toBe(null);
        expect(comment).toEqual(jasmine.any(Object));

        // trigger Mongoose's toJSON transformations
        //expect(Object.keys(JSON.parse(JSON.stringify(comment))).sort()).toEqual([
        //  '_id',
        //  'body',
        //  'created',
        //  'id'
        //]);

        expect(comment.id).toBe(comments[0].id);
        expect(comment.body).toBe(comments[0].body);
        expect(comment.__v).toBeUndefined();
        expect(comment.created.by).toEqual(jasmine.any(Object));
        expect(comment.created.by.displayName).toBe(users[0].displayName);
        done();
      });
    });
  });

  xdescribe('with subdocument paging params', function () {
    var blogDoc;
    var comments;
    var subDocsSortedByDate;
    var subDocsSortedByDateReversed;
    var pagingParams = {
      limit: 5
    };

    beforeAll(function (done) {
      BlogAnon.collection.remove(function () {
        done();
      });
    });

    // create parent doc
    beforeAll(function (done) {
      BlogAnon.createDoc({title: faker.lorem.sentence()}, function (err, blog) {
        blogDoc = blog;
        done();
      });
    });

    // create coll docs
    beforeAll(function (done) {
      async.times(20, function(n, next) {
        var text = faker.lorem.paragraph();

        BlogAnon.createCollDoc(blogDoc.id, 'comments', {title:  text, created: {date: (new Date()).setMilliseconds(n)}}, next);
      }, function (err, commentArray) {
        comments = commentArray;

        subDocsSortedByDate = comments.sort(function (a, b) {
          return a.created.date - b.created.date;
        });

        // reverse() modifies the array directly so we use a map to create a new array
        subDocsSortedByDateReversed = subDocsSortedByDate.map(function (v) {return v;}).reverse();

        done();
      });
    });

    it('should return first 5 records', function (done) {
      BlogAnon.readCollDocs(blogDoc.id, pagingParams, function (err, block) {
        expect(err).toBe(null);
        expect(block).toEqual(jasmine.any(Array));
        expect(block.length).toBe(5);
        block.forEach(function (comment, i) {
          expect(comments[i].id).toBe(comment.id);
        });
        done();
      });
    });

    it('should return next 5 records with skip', function (done) {
      BlogAnon.readCollDocs(blogDoc.id, _.merge({}, pagingParams, {skip: 5}), function (err, block) {
        expect(block.length).toBe(5);

        block.forEach(function (comment, i) {
          expect(comments[i + 5].id).toBe(comment.id);
        });

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
    title: {
      type: String,
      required: true
    },
    blog: String,
    created: {
      date: {
        type: Date,
        default: Date.now,
        select: false
      }
    },
    comments: {
      type: [commentSchema],
      select: false
    }
  });

  blogAnonSchema.virtual('tags').get(function getTags() {
    return this.blog.split(' ').splice(0,3);
  });

  blogAnonSchema.set('toJSON', {virtuals: true});
  return blogAnonSchema;
}

function BlogSchema() {
  var blogSchema = BlogAnonSchema();
  blogSchema.add({
    created: {
      by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        select: false
      }
    },
    readers: {
      type: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
      }],
      select: false
    }
  });

  blogSchema.set('toJSON', {virtuals: true});
  return blogSchema;
}

function CommentSchema() {
  var commentSchema = Schema({
    body: {
      type: String,
      required: true
    },
    created: {
      by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        select: false
      },
      date: {
        type: Date,
        default: Date.now,
        select: false
      }
    }
  });

  commentSchema.virtual('tags').get(function getTags() {
    return this.body.split(' ').splice(0,3);
  });

  commentSchema.set('toJSON', {virtuals: true});
  return commentSchema;
}

function UserSchema() {
  var userSchema = Schema({
    displayName: String
  });

  userSchema.set('toJSON', {virtuals: true});
  return userSchema;
}
