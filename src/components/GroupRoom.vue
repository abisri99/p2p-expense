<template>
  <section class="group-room">
    <div class="header">
      <h2>Group: <span class="group-name">{{ groupName }}</span></h2>
      <p class="user-info">
        Logged in as <strong>{{ username }}</strong> (<span class="peer-id">{{ myId }}</span>)
      </p>
      <div class="invite-row">
        <label>Invite Link:</label>
        <input class="invite-link" :value="inviteLink" readonly @focus="selectInvite" @click="copyInvite" />
        <span v-if="toastMessage" class="toast">{{ toastMessage }}</span>
      </div>
    </div>
    <div class="add-expense">
      <h3>Add Expense</h3>
      <input v-model="desc" placeholder="Description" class="input" autocomplete="off" />
      <input v-model.number="amount" type="number" min="0" placeholder="Amount" class="input" autocomplete="off" />
      <select v-model="paidBy" class="input">
        <option v-for="member in groupMembers" :key="member" :value="member">{{ member }}</option>
      </select>
      <button @click="addExpense" :disabled="!desc || !amount || !paidBy" class="btn primary">Add Expense</button>
    </div>
    <div class="expense-list">
      <div v-for="(exp, i) in expenses" :key="exp.id || i" class="expense-card">
        <span class="payer">{{ exp.paidBy }}</span>
        <span class="paid-amount">paid ₹{{ exp.amount }}</span>
        <span class="for-desc" v-if="exp.description">for <em>{{ exp.description }}</em></span>
      </div>
    </div>
    <button class="btn secondary" @click="backToDashboard">Back to Dashboard</button>
    <pre id="log" class="log">{{ logText }}</pre>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const groupId = route.params.groupId
const pass = route.query.pass || localStorage.getItem('pass') || ''
const groupName = ref(localStorage.getItem('groupName') || groupId)
const username = ref(localStorage.getItem('username') || '')

const BACKEND_URL = "https://solutus-p2p-room-ap-68.deno.dev"

const myId = ref(localStorage.getItem('peerId') || '')
const peer = ref(null)
const connections = ref([])
const expenses = ref([])
const logText = ref('')
const inviteLink = computed(() => `${location.origin}/groups/${groupId}?pass=${pass}`)
const desc = ref('')
const amount = ref('')
const paidBy = ref('')
const toastMessage = ref('')

const groupMembers = ref([])

const localStorageKey = computed(() => `expenses_${groupId}`)

onMounted(() => {
  loadExpenses()
  fetchGroupMembers()
  connectToGroup()
})

async function fetchGroupMembers() {
  try {
    const res = await fetch(`${BACKEND_URL}/group/${groupId}/users`)
    if (res.ok) {
      groupMembers.value = await res.json()
      if (groupMembers.value.length && !paidBy.value) {
        paidBy.value = groupMembers.value.includes(username.value)
          ? username.value
          : groupMembers.value[0]
      }
    } else {
      groupMembers.value = [username.value]
      paidBy.value = username.value
    }
  } catch (e) {
    groupMembers.value = [username.value]
    paidBy.value = username.value
  }
}

function loadExpenses() {
  const saved = localStorage.getItem(localStorageKey.value)
  if (saved) {
    expenses.value = JSON.parse(saved)
  } else {
    expenses.value = []
  }
}

function saveExpenses() {
  localStorage.setItem(localStorageKey.value, JSON.stringify(expenses.value))
}

function selectInvite(e) {
  e.target.select()
}

function copyInvite(e) {
  selectInvite(e)
  try {
    navigator.clipboard.writeText(inviteLink.value)
    showToast("Invite link copied!")
  } catch {
    // fallback handled by selectInvite
  }
}

function backToDashboard() {
  router.push('/groups')
}

function log(...args) {
  logText.value += args.join(" ") + "\n"
}

function showToast(msg) {
  toastMessage.value = msg
  setTimeout(() => { toastMessage.value = '' }, 1500)
}

// --- P2P Sync Section ---

async function connectToGroup() {
  peer.value = new window.Peer(myId.value)
  peer.value.on("open", async id => {
    myId.value = id
    await fetch(`${BACKEND_URL}/room/${groupId}?pass=${pass}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.value, peerId: id })
    })

    // Add user to group membership if joined via invite
    await fetch(`${BACKEND_URL}/user/${username.value}/joinGroup/${groupId}`, { method: "POST" })

    const res = await fetch(`${BACKEND_URL}/room/${groupId}?pass=${pass}`)
    const peers = await res.json()
    for (const [name, pid] of Object.entries(peers)) {
      if (name !== username.value) {
        const connection = peer.value.connect(pid)
        connections.value.push(connection)
        connection.on("open", () => {
          log("Connected to:", name)
          // Send all expenses upon connection
          connection.send({ type: "sync_all", data: expenses.value })
        })
        connection.on("data", data => handleIncoming(data, connection))
      }
    }
  })

  peer.value.on("connection", connection => {
    connections.value.push(connection)
    connection.on("open", () => {
      connection.send({ type: "sync_all", data: expenses.value })
    })
    connection.on("data", data => handleIncoming(data, connection))
  })
}

function handleIncoming(data, from) {
  if (data.type === "expense") {
    if (!expenses.value.find(e => e.id === data.data.id)) {
      expenses.value.push(data.data)
      saveExpenses()
      log("Received:", JSON.stringify(data.data))
      connections.value.forEach(c => {
        if (c !== from && c.open) c.send(data)
      })
    }
  } else if (data.type === "sync_all") {
    let changed = false
    for (const incoming of data.data) {
      if (!expenses.value.find(e => e.id === incoming.id)) {
        expenses.value.push(incoming)
        changed = true
      }
    }
    if (changed) {
      saveExpenses()
      log("Synced expenses from peer")
    }
  }
}

function addExpense() {
  if (!desc.value || !amount.value || !paidBy.value) return
  const expense = {
    id: `${Date.now()}_${username.value}_${Math.floor(Math.random()*10000)}`,
    description: desc.value,
    amount: Number(amount.value),
    paidBy: paidBy.value
  }
  expenses.value.push(expense)
  saveExpenses()
  connections.value.forEach(c => c.open && c.send({ type: "expense", data: expense }))
  desc.value = ''
  amount.value = ''
  paidBy.value = groupMembers.value.includes(username.value)
    ? username.value
    : (groupMembers.value[0] || '')
  showToast("Expense added")
}
</script>

<style scoped>
.group-room {
  max-width: 430px;
  margin: 2rem auto;
  padding: 2rem 1.5rem 1.5rem;
  background: #f9fafc;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(40,64,120,0.07);
  font-family: 'Inter', Arial, sans-serif;
}
.header {
  margin-bottom: 1.5rem;
}
.group-name {
  color: #1976d2;
}
.user-info {
  margin-bottom: 0.75rem;
  font-size: 0.99em;
  color: #555;
}
.invite-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.4rem;
}
.invite-link {
  flex: 1;
  padding: 0.3em 0.65em;
  border: 1px solid #b5cdf3;
  border-radius: 5px;
  background: #f3f8fe;
  font-size: 0.97em;
}
.toast {
  margin-left: 0.5em;
  color: #157b26;
  font-weight: 500;
}
.add-expense {
  margin-bottom: 1.7rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid #e3eaf1;
}
.input {
  display: block;
  width: 100%;
  margin-bottom: 0.7rem;
  padding: 0.44em 0.7em;
  border: 1px solid #b8c8e7;
  border-radius: 5px;
  background: #fff;
  font-size: 1em;
  transition: border 0.2s;
}
.input:focus {
  border-color: #1976d2;
  outline: none;
}
.btn {
  padding: 0.5em 1.2em;
  border-radius: 5px;
  border: none;
  font-size: 1em;
  cursor: pointer;
  margin-top: 0.3em;
}
.btn.primary {
  background: #1976d2;
  color: #fff;
}
.btn.primary:disabled {
  background: #a3c2f3;
  color: #f5f5f5;
  cursor: not-allowed;
}
.btn.secondary {
  background: #eee;
  color: #444;
  margin-top: 1.5em;
}
.expense-list {
  margin: 1.2em 0;
}
.expense-card {
  background: #fff;
  border: 1px solid #dde6f4;
  border-radius: 7px;
  margin-bottom: 0.7em;
  padding: 0.75em 1em;
  display: flex;
  align-items: center;
  gap: 0.5em;
  font-size: 1.01em;
}
.payer {
  font-weight: 600;
  color: #1976d2;
}
.paid-amount {
  font-weight: 600;
  color: #1a7a08;
  margin-left: 0.25em;
}
.for-desc {
  color: #636e8b;
  margin-left: 0.5em;
  font-style: italic;
}
.log {
  max-height: 170px;
  overflow-y: auto;
  background: #f5f5fe;
  border-radius: 7px;
  font-size: 0.97em;
  margin-top: 1.2em;
  padding: 0.7em 0.6em;
  color: #234;
}
@media (max-width: 540px) {
  .group-room {
    padding: 1rem 0.3rem 1.3rem;
  }
  .invite-link {
    font-size: 0.95em;
  }
}
</style>