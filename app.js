const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get("mode");
const autoJoinId = urlParams.get("id");
const autoRoomPass = urlParams.get("pass");

const BACKEND_URL = "https://solutus-p2p-room-ap-68.deno.dev";

let username = localStorage.getItem("username");
if (!username) {
  username = prompt("Enter your name:");
  if (!username) throw new Error("Username is required");
  localStorage.setItem("username", username);
}

let peerId = localStorage.getItem("peerId");
if (!peerId) {
  peerId = `${username}-${Math.random().toString(36).slice(2, 6)}`;
  localStorage.setItem("peerId", peerId);
}

let room = localStorage.getItem("room");
let pass = localStorage.getItem("pass");

if (!room || !pass) {
  room = "room-" + Math.random().toString(36).slice(2, 6);
  pass = Math.random().toString(36).slice(2, 10);
  localStorage.setItem("room", room);
  localStorage.setItem("pass", pass);
}

function generateInviteLink() {
  const link = `${location.origin}?mode=join&id=${peerId}&pass=${pass}`;
  document.getElementById("inviteLink").value = link;
}

async function registerSelf(pid) {
  await fetch(`${BACKEND_URL}/room/${room}?pass=${pass}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, peerId: pid }),
  });
}

async function fetchPeers() {
  const res = await fetch(`${BACKEND_URL}/room/${room}?pass=${pass}`);
  return await res.json();
}

// App state
let peer = null;
let conn = null;
let expenses = [];
let connections = [];

const log = (...args) => {
  document.getElementById("log").textContent += args.join(" ") + "\n";
};

const renderExpenses = () => {
  const list = document.getElementById("expenseList");
  list.innerHTML = "";
  expenses.forEach((exp) => {
    const item = document.createElement("li");
    item.textContent = `${exp.paidBy} paid ₹${exp.amount} for "${exp.description}"`;
    list.appendChild(item);
  });
  localStorage.setItem("expenses", JSON.stringify(expenses));
};

const saved = localStorage.getItem("expenses");
if (saved) {
  expenses = JSON.parse(saved);
  renderExpenses();
  log("Loaded expenses from localStorage");
}

const broadcastExpense = (expense) => {
  if (conn && conn.open) {
    conn.send({ type: "expense", data: expense });
  } else {
    connections.forEach((c) => {
      if (c.open) c.send({ type: "expense", data: expense });
    });
  }
};

const handleIncoming = (data) => {
  if (data.type === "expense") {
    expenses.push(data.data);
    renderExpenses();
    log("Received expense:", JSON.stringify(data.data));
  }
  if (data.type === "sync_all") {
    expenses = data.data || [];
    renderExpenses();
    log("Synced full expense list");
  }
};

// CREATE
document.getElementById("createBtn").onclick = () => {
  peer = new Peer(peerId);
  peer.on("open", async (id) => {
    document.getElementById("myId").textContent = id;
    await registerSelf(id);
    generateInviteLink();

    const allPeers = await fetchPeers();
    for (const [name, pid] of Object.entries(allPeers)) {
      if (name !== username) {
        const connection = peer.connect(pid);
        connections.push(connection);
        connection.on("open", () => log("Connected to:", name));
      }
    }
  });

  peer.on("connection", (connection) => {
    connections.push(connection);
    log("Peer connected:", connection.peer);

    connection.on("open", () => {
      connection.send({ type: "sync_all", data: expenses });
      connection.on("data", (data) => {
        if (data.type === "expense") {
          expenses.push(data.data);
          renderExpenses();
          log("Received from peer:", JSON.stringify(data.data));
          connections.forEach((conn) => {
            if (conn !== connection && conn.open) {
              conn.send({ type: "expense", data: data.data });
            }
          });
        }
      });
    });
  });
};

// JOIN
document.getElementById("joinBtn").onclick = () => {
  const sessionId = document.getElementById("joinId").value;
  peer = new Peer(peerId);

  peer.on("open", async (id) => {
    document.getElementById("myId").textContent = id;
    await registerSelf(id);

    conn = peer.connect(sessionId);
    document.getElementById("peerId").textContent = sessionId;

    conn.on("open", () => {
      conn.on("data", handleIncoming);
    });
  });
};

// Add expense
document.getElementById("addExpense").onclick = () => {
  const desc = document.getElementById("desc").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const paidBy = document.getElementById("paidBy").value;

  if (!desc || isNaN(amount) || !paidBy) {
    alert("Fill all fields");
    return;
  }

  const expense = { description: desc, amount, paidBy };
  expenses.push(expense);
  renderExpenses();
  broadcastExpense(expense);
  log("Added expense:", JSON.stringify(expense));

  document.getElementById("desc").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("paidBy").value = "";
};

// Logout
document.getElementById("logoutBtn").onclick = () => {
  if (confirm("Are you sure you want to logout?")) {
    localStorage.clear();
    location.reload();
  }
};

// Auto create/join
window.addEventListener("DOMContentLoaded", () => {
  if (mode === "create") {
    document.getElementById("createBtn").click();
  }

  if (mode === "join" && autoJoinId) {
    document.getElementById("joinId").value = autoJoinId;
    const passInput = document.getElementById("roomPass");
    if (passInput && autoRoomPass) passInput.value = autoRoomPass;
    document.getElementById("joinBtn").click();
  }

  if (mode) {
    document.getElementById("createBtn").style.display = "none";
    document.getElementById("joinBtn").style.display = "none";
  }
});