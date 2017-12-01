const { xml2js } = require('xml-js');
const jpath = require('jsonpath');

const Instance = require('./instance');
const ActeeTrait = require('../trait/actee');
const Problem = require('../../problem');
const { withCreateTime } = require('../../util/instance');
const { resolve, reject } = require('../../reused/promise');

module.exports = Instance.with(ActeeTrait)(({ simply, Form, forms }) => class {
  forCreate() { return withCreateTime(this); }
  create() { return forms.create(this); }

  forApi() { return this.without('id', 'acteeId', 'deletedAt'); }

  // TODO: is this effectively our fromSerialize here? does it even matter?
  static fromXml(xml) {
    let json = null; // for once js does scoping and it ruins everything.
    try {
      json = xml2js(xml, { compact: true });
    } catch (ex) {
      return reject(Problem.user.unparseable({ format: 'xml', rawLength: xml.length }));
    }

    const [ xmlFormId ] = jpath.query(json, '$.*.*.model.instance.*._attributes.id');
    if (xmlFormId == null)
      return reject(Problem.user.missingParameter({ field: 'formId' }));

    return resolve(new this({ xmlFormId, xml }));
  }

  static getByXmlFormId(xmlFormId) {
    return simply.getOneWhere('forms', { xmlFormId }, Form);
  }

  static getAll() { return forms.getAll(); }
});
