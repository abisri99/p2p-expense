<template>
  <section>
    <h2>Welcome, <span style="color:#1976d2;">{{ username }}</span></h2>
    <h3 style="margin-top:1.4rem;">Your Groups</h3>
    <ul v-if="!loading && groups.length">
      <li v-for="group in groups" :key="group.id" @click="joinGroup(group)">
        <b>{{ group.name || group.id }}</b>
      </li>
    </ul>
    <ul v-if="loading">
      <li>Loading...</li>
    </ul>
    <div v-if="!loading && !groups.length" style="color:#888; margin-bottom:1rem;">
      No groups found.
    </div>

    <h3 style="margin-top:2.1rem;">Create New Group</h3>
    <input v-model="newGroupName" placeholder="Group Name" autocomplete="off" />
    <br>
    <input v-model="newGroupPass" placeholder="Passcode" autocomplete="off" />
    <br>
    <button @click="createGroup" :disabled="!newGroupName || !newGroupPass">Create Group</button>
    <br>
    <button style="background:#eee;color:#444;" @click="logout">Logout</button>

    <span v-if="toastMessage" class="toast">{{ toastMessage }}</span>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref(localStorage.getItem('username') || '')

const BACKEND_URL = "https://solutus-p2p-room-ap-68.deno.dev"

const groups = ref([])
const loading = ref(true)
const newGroupName = ref('')
const newGroupPass = ref('')
const toastMessage = ref('')

onMounted(() => {
  fetchUserGroups()
})

async function fetchUserGroups() {
  loading.value = true
  const res = await fetch(`${BACKEND_URL}/user/${username.value}/groups`)
  const ids = res.ok ? await res.json() : []
  groups.value = []
  for (const id of ids) {
    const meta = await fetchGroupMeta(id)
    groups.value.push({
      id,
      ...meta,
    })
  }
  loading.value = false
}

async function fetchGroupMeta(groupId) {
  const res = await fetch(`${BACKEND_URL}/group/${groupId}`)
  return res.ok ? await res.json() : {}
}

async function createGroup() {
  const name = newGroupName.value.trim()
  const passcode = newGroupPass.value.trim()
  if (!name || !passcode) return showToast("Name + pass required")

  const res = await fetch(`${BACKEND_URL}/group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, createdBy: username.value, pass: passcode })
  })

  const data = await res.json()
  if (!data?.groupId) return showToast("Failed to create group")
  showToast("Group created! Invite link copied.")
  copyToClipboard(`${location.origin}/groups/${data.groupId}?pass=${passcode}`)
  newGroupName.value = ''
  newGroupPass.value = ''
  await fetchUserGroups()
}

function joinGroup(group) {
  router.push({
    name: 'GroupRoom',
    params: { groupId: group.id },
    query: { pass: group.pass || '' }
  })
}

function logout() {
  localStorage.clear()
  router.push('/login')
}

function showToast(msg) {
  toastMessage.value = msg
  setTimeout(() => { toastMessage.value = '' }, 2000)
}

function copyToClipboard(text) {
  try {
    navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}
</script>