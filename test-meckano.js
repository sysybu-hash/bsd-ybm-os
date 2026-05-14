const fetch = require('node-fetch');

async function test() {
  const apiKey = "OFIUOILqHkqISR9KXTcnMBinWcN2RTOxsy6YzzD3Anw3n";
  
  console.log("Testing with token in header...");
  const res1 = await fetch('https://app.meckano.co.il/rest/users', {
    method: 'GET',
    headers: {
      'token': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  });
  console.log("Res 1:", await res1.json());

  console.log("\nTesting with key in header...");
  const res2 = await fetch('https://app.meckano.co.il/rest/users', {
    method: 'GET',
    headers: {
      'key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  });
  console.log("Res 2:", await res2.json());

  console.log("\nTesting with token in query...");
  const res3 = await fetch(`https://app.meckano.co.il/rest/users?token=${apiKey}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  });
  console.log("Res 3:", await res3.json());
}

test();
