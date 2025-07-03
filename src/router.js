import { createRouter, createWebHistory } from 'vue-router'
import LoginScreen from './components/LoginScreen.vue'
import Dashboard from './components/Dashboard.vue'
import GroupRoom from './components/GroupRoom.vue'

const routes = [
  {
    path: '/',
    redirect: () => {
      const username = localStorage.getItem('username')
      return username ? '/groups' : '/login'
    }
  },
  { path: '/login', name: 'Login', component: LoginScreen },
  { path: '/groups', name: 'Dashboard', component: Dashboard },
  { 
    path: '/groups/:groupId', 
    name: 'GroupRoom', 
    component: GroupRoom,
    props: route => ({
      groupId: route.params.groupId,
      pass: route.query.pass
    })
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router