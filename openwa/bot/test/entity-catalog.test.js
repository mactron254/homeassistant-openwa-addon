'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCatalog } = require('../src/entity-catalog');
const { parseCsv } = require('../src/csv');

test('merges CSV knowledge with Home Assistant states', () => {
  const rows = parseCsv('entity_id,friendly_name,area,zone,aliases,capabilities,priority,critical,description\nsensor.solar_power,Potencia placas,energia,tejado,"placas;planta;solar",read,10,false,Generacion solar actual');
  const catalog = buildCatalog({
    rows,
    states: [
      { entity_id: 'sensor.solar_power', state: '4200', attributes: { friendly_name: 'Solar', unit_of_measurement: 'W', device_class: 'power' } },
    ],
  });

  const entity = catalog.get('sensor.solar_power');
  assert.equal(entity.friendly_name, 'Potencia placas');
  assert.equal(entity.area, 'energia');
  assert.equal(entity.zone, 'tejado');
  assert.deepEqual(entity.aliases, ['placas', 'planta', 'solar']);
  assert.equal(entity.state, '4200');
  assert.equal(entity.unit, 'W');
});

test('searches by semantic alias and area', () => {
  const catalog = buildCatalog({
    rows: [
      { entity_id: 'sensor.solar_power', area: 'energia', aliases: 'placas;planta', priority: '10' },
      { entity_id: 'number.evcc_limit', area: 'coche', aliases: 'cargador;evcc', capabilities: 'read;control', priority: '8' },
    ],
    states: [
      { entity_id: 'sensor.solar_power', state: '4200', attributes: { friendly_name: 'Potencia solar' } },
      { entity_id: 'number.evcc_limit', state: '16', attributes: { friendly_name: 'Limite EVCC' } },
    ],
  });

  assert.equal(catalog.search('que generan las placas')[0].entity_id, 'sensor.solar_power');
  assert.equal(catalog.search('coche cargador')[0].entity_id, 'number.evcc_limit');
});
