const chai = require('chai');
const chaiHttp = require('chai-http');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./../config/config');
const { app, runServer, closeServer } = require('../server');
const { testUsers } = require('./test-data');

const should = chai.should();
chai.use(chaiHttp);

describe('sessions routes', function () {
  before(() => {
    return runServer();
  });

  after(() => {
    return closeServer();
  });

  describe('POST requests to /sign-up', function () {
    it('should fail with missing field', function () {
      const missingPW =
        {
          email: 'amanda@test.com'
        };

      return chai.request(app)
        .post('/sign-up')
        .send(missingPW)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.should.have.status(422);
          err.response.body.message.should.equal('Missing field');
        });
    });

    it('should fail if fields have whitespace', function () {
      const whitspaceUser =
        {
          email: '  amanda@test.com',
          password: 'Password123'
        };

      return chai.request(app)
        .post('/sign-up')
        .send(whitspaceUser)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.should.have.status(422);
          err.response.body.message.should.equal('Cannot start or end with whitespace');
        });
    });

    it('should fail if password is too short', function () {
      const shortPW =
        {
          email: 'amanda@test.com',
          password: '1'
        };

      return chai.request(app)
        .post('/sign-up')
        .send(shortPW)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.should.have.status(422);
          err.response.body.message.should.equal('Must be at least 8 characters long');
        });
    });

    it('should fail with email that is already in use', function () {
      const existingUser =
        {
          email: testUsers[0].email,
          password: testUsers[0].password
        };

      return chai.request(app)
        .post('/sign-up')
        .send(existingUser)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.should.have.status(422);
          err.response.body.message.should.equal('Email already taken');
        });
    });

    it('should create new user on successful submit', function () {
      const newUser =
        {
          email: 'jane@test.com',
          password: 'fakePassword1'
        };

      return chai.request(app)
        .post('/sign-up')
        .send(newUser)
        .then((res) => {
          res.should.have.status(201);
          res.body.should.be.an('object');
          res.body.should.include.keys(
            'email', 'uuid'
          );
          res.body.email.should.equal(newUser.email);
          return User
            .query()
            .skipUndefined()
            .where('email', newUser.email);
        })
        .then((user) => {
          user[0].email.should.equal(newUser.email);
          user[0].uuid.should.not.be.null;
          // password should be hashed so it should not equal the submitted password
          user[0].password.should.not.equal(newUser.password);
        });
    });
  });

  describe('POST requests to /login', function () {
    it('should fail with no credentials ', function () {
      const emptyUser =
        {
          email: '',
          password: ''
        };

      return chai.request(app)
        .post('/login')
        .send(emptyUser)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.response.should.have.status(400);
          err.response.text.should.equal('Bad Request');
        });
    });

    it('should fail with incorrect email', () => {
      const wrongEmail =
        {
          email: 'wrong@test.com',
          password: testUsers[0].password
        };

      return chai.request(app)
        .post('/login')
        .send(wrongEmail)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.response.should.have.status(401);
          err.response.text.should.equal('Unauthorized');
        });
    });

    it('should fail with incorrect password', () => {
      const wrongPW =
        {
          email: testUsers[0].email,
          password: 'wrongPassword'
        };

      return chai.request(app)
        .post('/login')
        .send(wrongPW)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.response.should.have.status(401);
          err.response.text.should.equal('Unauthorized');
        });
    });

    it('should return a valid auth token on successful login', () => {
      const existingUser =
        {
          email: testUsers[0].email,
          password: testUsers[0].password,
          uuid: testUsers[0].uuid
        };

      return chai.request(app)
        .post('/login')
        .send(existingUser)
        .then((res) => {
          res.should.have.status(200);
          res.body.should.be.an('object');
          const token = res.body.authToken;
          token.should.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          payload.user.email.should.equal(existingUser.email);
          payload.user.uuid.should.equal(existingUser.uuid);
        });
    });
  });

  describe('POST requests to /refresh', () => {
    const existingUser = {
      email: testUsers[0].email,
      uuid: testUsers[0].uuid
    };

    it('should reject requests with no token', () => {
      return chai.request(app)
        .post('/refresh')
        .then(() => {
          should.fail(null, null, 'Request should not succeed');
        })
        .catch((err) => {
          err.response.should.have.status(401);
          err.response.text.should.equal('Unauthorized');
        });
    });

    it('should reject requests with token that has an invalid secret', () => {
      const token = jwt.sign({ user: existingUser }, 'wrongSecret', {
        subject: existingUser.email,
        expiresIn: '7d',
        algorithm: 'HS256'
      });

      return chai.request(app)
        .post('/refresh')
        .set('Authorization', `Bearer ${token}`)
        .then(() => {
          should.fail(null, null, 'Request should not succeed');
        })
        .catch((err) => {
          err.response.should.have.status(401);
          err.response.text.should.equal('Unauthorized');
        });
    });

    it('should reject requests with an expired token', () => {
      const token = jwt.sign({
        user: existingUser,
        exp: Math.floor(Date.now() / 1000) - 30 // expired 30s ago
      },
      JWT_SECRET, {
        subject: existingUser.email,
        algorithm: 'HS256'
      });

      return chai.request(app)
        .post('/refresh')
        .set('authorization', `Bearer ${token}`)
        .then(() => {
          should.fail(null, null, 'Request should not succeed');
        })
        .catch((err) => {
          err.response.should.have.status(401);
          err.response.text.should.equal('Unauthorized');
        });
    });

    it('should return a valid auth token with a new expiry date on successful refresh', () => {
      const token = jwt.sign({ user: existingUser }, JWT_SECRET, {
        subject: existingUser.email,
        expiresIn: '7d',
        algorithm: 'HS256'
      });

      const decoded = jwt.decode(token);

      return chai.request(app)
        .post('/refresh')
        .set('authorization', `Bearer ${token}`)
        .then((res) => {
          res.should.have.status(200);
          res.body.should.be.an('object');
          const token = res.body.authToken;
          token.should.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          payload.user.should.deep.equal({
            email: existingUser.email,
            uuid: existingUser.uuid
          });
          payload.exp.should.be.at.least(decoded.exp);
        })
        .catch(err => console.error(err));
    });
  });

  describe('POST requests to /auth/facebook', function () {
    it('should fail with missing Facebook authToken', function () {
      const missingToken =
        {
          email: 'amanda@test.com',
          userID: '123'
        };

      return chai.request(app)
        .post('/auth/facebook')
        .send(missingToken)
        .then(() =>
          should.fail(null, null, 'Request should not succeed'))
        .catch((err) => {
          err.should.have.status(401);
          err.response.body.message.should.equal('Facebook login error');
        });
    });

    it('should return a valid auth token on successful login of existing user without facebookId', function () {
      const existingUser = {
        email: testUsers[0].email,
        uuid: testUsers[0].uuid
      };
      const token = jwt.sign({ user: existingUser }, JWT_SECRET, {
        subject: existingUser.email,
        expiresIn: '7d',
        algorithm: 'HS256'
      });
      const decoded = jwt.decode(token);
      const facebookRes =
        {
          accessToken: '123',
          email: existingUser.email,
          userID: '123'
        };

      return chai.request(app)
        .post('/auth/facebook')
        .send(facebookRes)
        .then((res) => {
          res.should.have.status(200);
          res.body.should.be.an('object');
          const token = res.body.authToken;
          token.should.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          payload.user.should.deep.equal({
            email: existingUser.email,
            uuid: existingUser.uuid
          });
          payload.exp.should.be.at.least(decoded.exp);
        });
    });

    it('should return a valid auth token on successful login of existing user with facebookId', function () {
      const existingUser = {
        email: testUsers[1].email,
        uuid: testUsers[1].uuid,
        facebookId: testUsers[1].facebookId
      };
      const token = jwt.sign({
        user: { email: existingUser.email, uuid: existingUser.uuid }
      }, JWT_SECRET, {
        subject: existingUser.email,
        expiresIn: '7d',
        algorithm: 'HS256'
      });
      const decoded = jwt.decode(token);
      const facebookRes =
        {
          accessToken: '123',
          email: existingUser.email,
          userID: existingUser.facebookId
        };

      return chai.request(app)
        .post('/auth/facebook')
        .send(facebookRes)
        .then((res) => {
          res.should.have.status(200);
          res.body.should.be.an('object');
          const token = res.body.authToken;
          token.should.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          payload.user.should.deep.equal({
            email: existingUser.email,
            uuid: existingUser.uuid
          });
          payload.exp.should.be.at.least(decoded.exp);
        });
    });

    it('should return a valid auth token on successful login of new user', function () {
      const newUser = {
        email: 'janedoe@test.com'
      };
      const token = jwt.sign({ user: newUser }, JWT_SECRET, {
        subject: newUser.email,
        expiresIn: '7d',
        algorithm: 'HS256'
      });
      const decoded = jwt.decode(token);
      const facebookRes =
        {
          accessToken: '456',
          email: newUser.email,
          userID: '456'
        };

      return chai.request(app)
        .post('/auth/facebook')
        .send(facebookRes)
        .then((res) => {
          res.should.have.status(200);
          res.body.should.be.an('object');
          const token = res.body.authToken;
          token.should.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          payload.user.email.should.deep.equal(newUser.email);
          payload.user.uuid.should.not.be.null;
          payload.exp.should.be.at.least(decoded.exp);
        });
    });
  });
});
