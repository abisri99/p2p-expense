<template>
  <section>
    <h2 style="margin-bottom:0.7rem;">Login</h2>
    <p style="color:#666;">Enter your name to continue:</p>
    <input v-model="loginName" placeholder="Your Name" @keyup.enter="login" autocomplete="username" />
    <br>
    <button @click="login" :disabled="!loginName.trim()">Enter</button>
  </section>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['logged-in'])
const loginName = ref('')

import { useRouter } from 'vue-router'
const router = useRouter()

function login() {
  const name = loginName.value.trim()
  if (!name) return
  localStorage.setItem('username', name)
  const peerId = `${name}-${Math.random().toString(36).slice(2, 6)}`
  localStorage.setItem('peerId', peerId)
  router.push('/groups')
}
</script>