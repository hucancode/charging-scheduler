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
const testGeneral = () => {
    buses = [
      { arrival: 70, battery: 70, required: 80, capacity: 100 },
      { arrival: 140, battery: 50, required: 70, capacity: 160 },
      { arrival: 180, battery: 38, required: 50, capacity: 160 },
      { arrival: 300, battery: 24, required: 30, capacity: 160 },
      { arrival: 305, battery: 54, required: 80, capacity: 160 },
      { arrival: 310, battery: 106, required: 100, capacity: 160 },
      { arrival: 315, battery: 56, required: 90, capacity: 160 },
      { arrival: 330, battery: 36, required: 80, capacity: 160 },
    ];
};

const testHighCapacity = () => {
  buses = [
    { arrival: 60, battery: 5, required: 300, capacity: 350 },
    { arrival: 120, battery: 10, required: 400, capacity: 450 },
    { arrival: 240, battery: 20, required: 500, capacity: 550 },
  ];
};

const testLowCapacity = () => {
  buses = [
    { arrival: 30, battery: 50, required: 60, capacity: 70 },
    { arrival: 150, battery: 40, required: 45, capacity: 50 },
    { arrival: 300, battery: 20, required: 30, capacity: 40 },
  ];
};

const testOverlappingArrivals = () => {
  buses = [
    { arrival: 100, battery: 30, required: 80, capacity: 100 },
    { arrival: 100, battery: 20, required: 60, capacity: 80 },
    { arrival: 100, battery: 10, required: 50, capacity: 70 },
  ];
};

const testSlowCharge = () => {
  buses = [
    { arrival: 70, battery: 0, required: 80, capacity: 100 },
  ];
}


const sketch = (p) => {
  let showBusList = true;

  p.setup = () => {
    p.createCanvas(WIDTH, HEIGHT);
    timeSlider = p.createSlider(0, CHARGE_DURATION_MINUTES, 0, 1);
    timeSlider.position(50, 10);
    timeSlider.style('width', '700px');
    testGeneral();

    let form = p.createDiv();
    form.position(WIDTH + 30, 80);
    form.style('width', '700px');

    form.child(p.createElement('h3', 'Add Bus'));
    form.child(p.createElement('label', 'Arrival Time (minutes):'));
    form.child(p.createElement('br'));
    let arrivalInput = p.createInput('');
    form.child(arrivalInput);
    form.child(p.createElement('br'));

    form.child(p.createElement('label', 'Battery Level (0 - 100%):'));
    form.child(p.createElement('br'));
    let batteryInput = p.createInput('');
    form.child(batteryInput);
    form.child(p.createElement('br'));

    form.child(p.createElement('label', 'Required Battery (kW):'));
    form.child(p.createElement('br'));
    let requiredInput = p.createInput('');
    form.child(requiredInput);
    form.child(p.createElement('br'));

    form.child(p.createElement('label', 'Capacity (kW):'));
    form.child(p.createElement('br'));
    let capacityInput = p.createInput('');
    form.child(capacityInput);
    form.child(p.createElement('br'));

    let addButton = p.createButton('Add Bus');
    form.child(addButton);

    let formDefaults = {
      arrival: Math.floor(p.random(0, CHARGE_DURATION_MINUTES)),
      battery: parseFloat(p.random(0, 30).toFixed(1)),
      required: parseFloat(p.random(50, 160).toFixed(1)),
      capacity: parseFloat(p.random(100, 200).toFixed(1)),
    };

    arrivalInput.value(formDefaults.arrival);
    batteryInput.value(formDefaults.battery);
    requiredInput.value(formDefaults.required);
    capacityInput.value(formDefaults.capacity);

    addButton.mousePressed(() => {
      let arrival = parseInt(arrivalInput.value());
      let battery = parseFloat(batteryInput.value());
      let required = parseFloat(requiredInput.value());
      let capacity = parseFloat(capacityInput.value());

      if (!isNaN(arrival) && !isNaN(battery) && !isNaN(required) && !isNaN(capacity)) {
        buses.push({
          arrival: arrival,
          battery: battery,
          required: required,
          capacity: capacity,
        });
        console.log("New bus added:", buses[buses.length - 1]);
      }

      // Set new default values
      formDefaults = {
        arrival: Math.floor(p.random(0, CHARGE_DURATION_MINUTES)),
        battery: parseFloat(p.random(0, 30).toFixed(1)),
        required: parseFloat(p.random(50, 160).toFixed(1)),
        capacity: parseFloat(p.random(100, 200).toFixed(1)),
      };

      // Update input fields with new defaults
      arrivalInput.value(formDefaults.arrival);
      batteryInput.value(formDefaults.battery);
      requiredInput.value(formDefaults.required);
      capacityInput.value(formDefaults.capacity);

      buses.sort((a, b) => a.arrival - b.arrival);

      // Recalculate schedule after adding a bus
      schedule = makeSchedule(fabricateBuses(timeSlider.value()));
    });

    let toggleBusListButton = p.createButton('Hide Bus List');
    form.child(toggleBusListButton);
    toggleBusListButton.mousePressed(() => {
      showBusList = !showBusList;
      toggleBusListButton.html(showBusList ? 'Hide Bus List' : 'Show Bus List');
    });
    let removeAllButton = p.createButton('Remove All Buses');
    form.child(removeAllButton);
    removeAllButton.mousePressed(() => {
      buses = [];
      schedule = [];
      activeBuses = [];
      console.log("All buses removed");
    });

    let testForm = p.createDiv();
    testForm.position(WIDTH + 30, 320);
    testForm.child(p.createElement('h3', 'Test Cases'));
    let testGeneralButton = p.createButton('Test General');
    testForm.child(testGeneralButton);
    testGeneralButton.mousePressed(() => {
      console.log("Test General", p);
      testGeneral();
      schedule = makeSchedule(fabricateBuses(timeSlider.value()));
    });
    let testSlowChargeButton = p.createButton('Test Slow Charge');
    testForm.child(testSlowChargeButton);
    testSlowChargeButton.mousePressed(() => {
      testSlowCharge();
      schedule = makeSchedule(fabricateBuses(timeSlider.value()));
    });

    // Add buttons for the new test cases
    let testHighCapacityButton = p.createButton('Test High Capacity');
    testForm.child(testHighCapacityButton);
    testHighCapacityButton.mousePressed(() => {
      testHighCapacity();
      schedule = makeSchedule(fabricateBuses(timeSlider.value()));
    });

    let testLowCapacityButton = p.createButton('Test Low Capacity');
    testForm.child(testLowCapacityButton);
    testLowCapacityButton.mousePressed(() => {
      testLowCapacity();
      schedule = makeSchedule(fabricateBuses(timeSlider.value()));
    });

    let testOverlappingArrivalsButton = p.createButton('Test Overlapping Arrivals');
    testForm.child(testOverlappingArrivalsButton);
    testOverlappingArrivalsButton.mousePressed(() => {
      testOverlappingArrivals();
      schedule = makeSchedule(fabricateBuses(timeSlider.value()));
    });
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

    // Draw Bus List Overlay
    if (showBusList) {
      p.fill(255, 255, 255, 200);
      p.rect(50, 100, WIDTH - 100, HEIGHT - 200);
      p.fill(0);
      p.textSize(14);
      p.text("Scenario", 60, 120);

      let y = 140;
      let colX = [60, 160, 260, 360, 460];
      let headers = ["Arrival", "Battery", "Required", "Capacity"];

      // Draw table headers
      for (let i = 0; i < headers.length; i++) {
        p.text(headers[i], colX[i], y);
      }

      y += 20;

      // Draw table rows
      buses.forEach((bus, index) => {
        // p.text(index, 60, y);
        p.text(bus.arrival, colX[0], y);
        p.text(bus.battery.toFixed(1), colX[1], y);
        p.text(bus.required.toFixed(1), colX[2], y);
        p.text(bus.capacity.toFixed(1), colX[3], y);
        y += 20;
      });
    }
  };

  p.mousePressed = () => {
    // No manual toggling in scheduler mode
  };
};

new p5(sketch);
