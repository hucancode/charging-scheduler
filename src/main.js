import p5 from "p5";

const WIDTH = 800;
const HEIGHT = 600;
const PADDING = 100;

const START_TIME = 22; // 10 PM
const END_TIME = 6; // 6 AM
const CHARGE_DURATION = (24 - START_TIME + END_TIME) % 24; // 8 hours
const CHARGE_DURATION_MINUTES = CHARGE_DURATION * 60; // in minutes
const MAX_CHARGE_RATE_KWHOUR = 50; // kW per hour
const MAX_CHARGE_RATE_KWMINUTE = MAX_CHARGE_RATE_KWHOUR / 60; // kW per hour
const SWITCH_TIME = 5; // minutes

let timeSlider;
let buses = [];
let schedule = [];
let lastArrivedBusCount = 0;
let activeBuses = [];
let selectedBus = null;

function countArrivedBuses(time) {
  let count = 0;
  for (let i = 0; i < buses.length; i++) {
    if (buses[i].arrival <= time) {
      count++;
    }
  }
  return count;
}

function makeSchedule(buses) {
  console.log("Make schedule with buses", buses);
  let schedule = [];
  let t = 0;
  let i = 0;
  while (t < CHARGE_DURATION_MINUTES) {
    let tnext = t;
    if (i < buses.length) {
      let bus = buses[i];
      tnext = Math.max(t, bus.arrival);
    } else {
      tnext = CHARGE_DURATION_MINUTES;
    }
    let extraTime = Math.max(0, tnext - t);
    if (extraTime > 0) {
      // redistribute extra time to all previous buses in the schedule
      console.log("Redistributing extra time", extraTime);
      let t = 0;
      for (let j = 0; j < schedule.length; j++) {
        t = Math.max(t, schedule[j].start);
        schedule[j].start = t;
        if (schedule[j].time <= 0) {
          continue;
        }
        let bus = buses[schedule[j].bus];
        schedule[j].time += extraTime / schedule.length;
        let newChargeAmount = Math.min(bus.capacity - bus.battery, schedule[j].speed * schedule[j].time);
        schedule[j].speed = newChargeAmount / schedule[j].time;
        t += schedule[j].time;
      }
      console.log("New schedule after redistribution", [...schedule]);
    }
    if (i >= buses.length) break;
    t = tnext;
    console.log("Charging bus", i, "at time", t);
    let bus = buses[i];
    if (bus.battery < bus.required) {
      let chargeAmount = Math.min(bus.required - bus.battery, MAX_CHARGE_RATE_KWMINUTE  * (CHARGE_DURATION_MINUTES - t));
      if (bus.required - bus.battery - chargeAmount > 0.1) {
        schedule.push({ bus: i, speed: 0, start: t, time: 0 });
      } else {
        let chargeTime = chargeAmount / MAX_CHARGE_RATE_KWMINUTE;
        schedule.push({ bus: i, speed: MAX_CHARGE_RATE_KWMINUTE , start: t, time: chargeTime });
        t += chargeTime;
      }
    } else {
      schedule.push({ bus: i, speed: 0, start: t, time: 0 });
    }
    console.log("new schedule", [...schedule]);
    i++;
  }
  for (; i < buses.length; i++) {
      schedule.push({ bus: i, speed: 0, start: t, time: 0 });
  }
  return schedule;
}

function fabricateBuses(t, optimistic = false) {
  let ret = [];
  for (let i = 0; i < buses.length; i++) {
    if (buses[i].arrival > t) {
      ret.push({
        id: buses[i].id,
        arrival: buses[i].arrival,
        battery: optimistic ? buses[i].capacity * 0.3 : 0,
        required: buses[i].required,
        capacity: buses[i].capacity,
      });
    } else {
      ret.push(buses[i]);
    }
  }
  return buses;
}

function sample(time, schedule) {
  let activeBuses = [];
  for (let i = 0; i < schedule.length; i++) {
    let item = schedule[i];
    if (buses[item.bus].arrival > time) {
      continue;
    }
    let chargeTime = Math.max(0, Math.min(item.start + item.time, time) - item.start);
    activeBuses.push({
      id: item.bus,
      battery: buses[item.bus].battery + item.speed * chargeTime,
      required: buses[item.bus].required,
      capacity: buses[item.bus].capacity,
      speed: item.speed,
    });
  }
  return activeBuses;
}

const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(WIDTH, HEIGHT);
    timeSlider = p.createSlider(0, CHARGE_DURATION_MINUTES, 0, 1);
    timeSlider.position(50, HEIGHT - 30);
    timeSlider.style('width', '700px');
    buses.push({ arrival: 70, battery: p.random(0, 20), required: 80, capacity: 100 });
    buses.push({ arrival: 140, battery: p.random(0, 20), required: 120, capacity: 160 });
    buses.push({ arrival: 180, battery: p.random(0, 20), required: 50, capacity: 160 });
    buses.push({ arrival: 200, battery: p.random(0, 20), required: 1600, capacity: 1600 });
    buses.push({ arrival: 290, battery: p.random(0, 20), required: 1600, capacity: 1600 });
    buses.push({ arrival: 300, battery: p.random(0, 20), required: 30, capacity: 160 });
    buses.push({ arrival: 300, battery: p.random(0, 20), required: 160, capacity: 160 });
    buses.push({ arrival: 310, battery: p.random(0, 20), required: 160, capacity: 160 });
    buses.push({ arrival: 310, battery: p.random(0, 20), required: 160, capacity: 160 });
    buses.push({ arrival: 330, battery: p.random(0, 20), required: 160, capacity: 160 });
    schedule = makeSchedule(fabricateBuses(0));
  };

  p.draw = () => {
    p.background(220);

    let elapsedMinutes = timeSlider.value();
    let currentTime = (START_TIME * 60 + elapsedMinutes) % (24 * 60);

    // Display current time
    let hour = Math.floor(currentTime / 60);
    let minute = currentTime % 60;
    p.fill(0);
    p.textSize(16);
    p.text(`Time: ${hour % 24}:${minute.toString().padStart(2, '0')}`, WIDTH / 2 - 50, 50);

    if(countArrivedBuses(elapsedMinutes) != lastArrivedBusCount) {
      lastArrivedBusCount = countArrivedBuses(elapsedMinutes);
      schedule = makeSchedule(fabricateBuses(elapsedMinutes));
    }
    activeBuses = sample(elapsedMinutes, schedule);

    // Draw bus status and charging bars
    for (let i = 0; i < activeBuses.length; i++) {
      let bus = activeBuses[i];
      let batteryLevel = bus.battery / bus.capacity;
      let y = 100 + i * 30;

      p.fill(0);
      p.textSize(12);
      p.text(
        `Bus ${i} - ${(batteryLevel * 100).toFixed(1)}% / ${(bus.required / bus.capacity * 100).toFixed(1)}% (MAX ${bus.capacity}kW)`,
        50, y
      );

      p.noFill();
      p.rect(300, y - 10, 150, 15);
      p.fill(0, 200, 0);
      let chargeWidth = p.map(batteryLevel, 0, 1, 0, 150);
      p.rect(300, y - 10, chargeWidth, 15);
    }

    // Display charging schedule
    p.fill(0);
    p.textSize(12);
    let w = 250;
    p.text("Charging Schedule:", WIDTH - w, 100);
    for (let i = 0; i < schedule.length; i++) {
      let item = schedule[i];
      let bus = buses[item.bus];
      if (bus.arrival > elapsedMinutes) {
        continue;
      }
      let y = 120 + i * 20;
      let t = (START_TIME * 60 + item.start) % (24 * 60);
      let hour = Math.floor(t / 60);
      let minute = Math.floor(t % 60);
      let startTimeStr = `${hour % 24}:${minute.toString().padStart(2, '0')}`;
      t = (START_TIME * 60 + item.start + item.time) % (24 * 60);
      hour = Math.floor(t / 60);
      minute = Math.floor(t % 60);
      let endTimeStr = `${hour % 24}:${minute.toString().padStart(2, '0')}`;
      p.text(`Bus ${item.bus}: ${startTimeStr} ~ ${endTimeStr} @ ${(60 * item.speed).toFixed(1)} kWH`, WIDTH - w, y);
    }
  };

  p.mousePressed = () => {
    // No manual toggling in scheduler mode
  };
};

new p5(sketch);
