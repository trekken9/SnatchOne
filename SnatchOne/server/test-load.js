#!/usr/bin/env node

/**
 * Load Testing Script for Snatch Unified Server
 * Simulates 100+ WebSocket connections to test server performance
 */

const WebSocket = require('ws');

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000';
const NUM_CONNECTIONS = parseInt(process.env.NUM_CONNECTIONS) || 100;
const TEST_DURATION = parseInt(process.env.TEST_DURATION) || 60000; // 60 seconds

// Test license key (you need to generate this in admin panel first)
const TEST_AUTH_KEY = process.env.TEST_AUTH_KEY || 'your_test_key_here';

console.log(`\n${"═".repeat(70)}`);
console.log(`🧪 LOAD TESTING - Snatch Unified Server`);
console.log(`${"═".repeat(70)}`);
console.log(`📡 Server: ${SERVER_URL}`);
console.log(`👥 Connections: ${NUM_CONNECTIONS}`);
console.log(`⏱️  Duration: ${TEST_DURATION / 1000}s`);
console.log(`${"═".repeat(70)}\n`);

const connections = [];
let successfulConnections = 0;
let failedConnections = 0;
let messagesReceived = 0;
let messagesSent = 0;

function createConnection(index) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${SERVER_URL}?SN-Auth=${TEST_AUTH_KEY}`);
      
      ws.on('open', () => {
        successfulConnections++;
        console.log(`✅ Connection ${index + 1}/${NUM_CONNECTIONS} established`);
        
        // Send a test message every 5 seconds
        const interval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'PING',
              timestamp: Date.now()
            }));
            messagesSent++;
          }
        }, 5000);
        
        connections.push({ ws, interval });
        resolve(true);
      });
      
      ws.on('message', (data) => {
        messagesReceived++;
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'STATS') {
            // Stats message received
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      ws.on('error', (error) => {
        failedConnections++;
        console.error(`❌ Connection ${index + 1} error:`, error.message);
        resolve(false);
      });
      
      ws.on('close', () => {
        console.log(`🔌 Connection ${index + 1} closed`);
      });
      
    } catch (error) {
      failedConnections++;
      console.error(`❌ Failed to create connection ${index + 1}:`, error.message);
      resolve(false);
    }
  });
}

async function runLoadTest() {
  console.log(`🚀 Starting load test...\n`);
  
  const startTime = Date.now();
  
  // Create connections in batches of 10 to avoid overwhelming the server
  const batchSize = 10;
  for (let i = 0; i < NUM_CONNECTIONS; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && (i + j) < NUM_CONNECTIONS; j++) {
      batch.push(createConnection(i + j));
    }
    await Promise.all(batch);
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📊 Connection Phase Complete`);
  console.log(`${"─".repeat(70)}`);
  console.log(`✅ Successful: ${successfulConnections}`);
  console.log(`❌ Failed: ${failedConnections}`);
  console.log(`📈 Success Rate: ${((successfulConnections / NUM_CONNECTIONS) * 100).toFixed(2)}%`);
  console.log(`${"─".repeat(70)}\n`);
  
  // Wait for test duration
  console.log(`⏳ Running test for ${TEST_DURATION / 1000} seconds...\n`);
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
  
  // Cleanup
  console.log(`🧹 Cleaning up connections...\n`);
  connections.forEach(({ ws, interval }) => {
    clearInterval(interval);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Final report
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 LOAD TEST RESULTS`);
  console.log(`${"═".repeat(70)}`);
  console.log(`⏱️  Total Duration: ${duration.toFixed(2)}s`);
  console.log(`👥 Total Connections: ${NUM_CONNECTIONS}`);
  console.log(`✅ Successful Connections: ${successfulConnections}`);
  console.log(`❌ Failed Connections: ${failedConnections}`);
  console.log(`📤 Messages Sent: ${messagesSent}`);
  console.log(`📥 Messages Received: ${messagesReceived}`);
  console.log(`📈 Success Rate: ${((successfulConnections / NUM_CONNECTIONS) * 100).toFixed(2)}%`);
  console.log(`🚀 Throughput: ${(messagesSent / duration).toFixed(2)} msg/s`);
  console.log(`${"═".repeat(70)}\n`);
  
  if (successfulConnections >= NUM_CONNECTIONS * 0.95) {
    console.log(`✅ PASS: Server handled ${successfulConnections}/${NUM_CONNECTIONS} connections successfully!\n`);
    process.exit(0);
  } else {
    console.log(`❌ FAIL: Server only handled ${successfulConnections}/${NUM_CONNECTIONS} connections.\n`);
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(`\n\n⚠️  Test interrupted by user. Cleaning up...\n`);
  connections.forEach(({ ws, interval }) => {
    clearInterval(interval);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  process.exit(0);
});

// Check if test auth key is provided
if (TEST_AUTH_KEY === 'your_test_key_here') {
  console.error(`\n❌ ERROR: Please set TEST_AUTH_KEY environment variable`);
  console.error(`   Generate a license key in the admin panel first.\n`);
  console.error(`   Usage: TEST_AUTH_KEY=your_key node test-load.js\n`);
  process.exit(1);
}

// Run the test
runLoadTest().catch(error => {
  console.error(`\n❌ Fatal error:`, error);
  process.exit(1);
});
