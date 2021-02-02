// Copyright 2021 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

const { sql } = require('slonik');
const { compose, uniq, flatten, map } = require('ramda');
const { Actor, Session } = require('../frames');
const { resolve, reject } = require('../../util/promise');
const Option = require('../../util/option');
const Problem = require('../../util/problem');

const can = (actor, verb, actee) => ({ oneFirst }) => {
  if (actor.acteeId === actee.acteeId) {
    // special privileges actors always get on themselves.
    if ((verb === 'user.read') || (verb === 'user.update'))
      return resolve(true);

    // all actors except app users can always log themselves out.
    if ((verb === 'session.end') && (this.type !== 'field_key'))
      return resolve(true);
  }

  return actee.acteeIds().then((acteeIds) => oneFirst(sql`
select count(*) from assignments
where "actorId"=${actor.id} and "acteeId" in ${sql.array(acteeIds)}
inner join (select id from roles where verbs ? ${verb}) as role on role.id=assignments."roleId"
limit 1`))
    .then((count) => count > 0);
};

const canAssignRole = (actor, role, actee) => ({ Assignments }) =>
  Assignments.verbsOn(actor.id, actee).then((hasArray) => {
    const has = new Set(hasArray);
    for (const required of role.verbs) if (!has.has(required)) return false;
    return true;
  });

const verbsOn = (actorId, actee) => ({ all }) =>
  resolve(actee.acteeIds())
    .then((acteeIds) => all(sql`
select verbs from roles
inner join (select "roleId" from assignments
  where "actorId"=${actorId} and "acteeId" in ${sql.array(acteeIds)})
  as assignments
  on assignments."roleId"=roles.id`))
    // TODO: it miiiiight be possible to make postgres do this work?
    .then(compose(uniq, flatten, map((r) => r.verbs)));


////////////////////////////////////////////////////////////////////////////////
// AUTH "INSTANCE"

// we provide a local object with basic auth methods on it, for ease of call
// (it's sort of a lot to ask people to Auth.canOrReject(maybeactor, … when
// the existing call pattern can just be serviced and is shorter and prevalent anyway)
const emptyAuth = Object.freeze({
  can() { return resolve(false); },
  canOrReject() { return reject(Problem.user.insufficientRights()); },
  canAssignRole() { return resolve(false); },
  verbsOn() { return resolve([]); },
  session: Option.none(),
  actor: Option.none(),
  isAuthenticated: false
});

// actor is required. session may or may not exist.
const actorAuth = (actor, session, Auth) => Object.freeze({
  can(verb, actee) { return Auth.can(actor, verb, actee); },
  canOrReject(verb, actee) {
    return Auth.can(actor, verb, actee)
      .then((result) => ((result === true) ? actee : reject(Problem.user.insufficientRights())));
  },
  canAssignRole(role, actee) { return Auth.canAssignRole(actor, role, actee); },
  verbsOn(actee) { return Auth.verbsOn(actor.id, actee); },
  session: Option.of(session),
  actor: Option.of(actor),
  isAuthenticated: true
});

// the actual interface, which determines what sort of response to compose.
const by = (x) => ({ Auth }) => (
  (x instanceof Session) ? actorAuth(x.actor, x, Auth) :
  (x instanceof Actor) ? actorAuth(x, undefined, Auth) : // eslint-disable-line indent
  emptyAuth // eslint-disable-line indent
);


module.exports = { can, canAssignRole, verbsOn, by };

