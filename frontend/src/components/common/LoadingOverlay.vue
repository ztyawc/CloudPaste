<template>
  <div v-if="visible" class="fixed inset-0 flex items-center justify-center z-50" :class="{ 'bg-gray-900 bg-opacity-60': !transparent, 'bg-transparent': transparent }">
    <div class="relative flex flex-col items-center p-6 rounded-lg" :class="{ 'bg-white shadow-xl': !transparent && !darkMode, 'bg-gray-800 shadow-xl': !transparent && darkMode }">
      <!-- 加载动画 -->
      <svg
          class="animate-spin h-10 w-10 mb-3"
          :class="transparent ? 'text-primary-500' : darkMode ? 'text-primary-400' : 'text-primary-600'"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>

      <!-- 加载文本 -->
      <div v-if="text" class="text-center text-md font-medium mt-2" :class="darkMode ? 'text-gray-200' : 'text-gray-700'">
        {{ text }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  darkMode: {
    type: Boolean,
    default: false,
  },
  text: {
    type: String,
    default: "",
  },
  transparent: {
    type: Boolean,
    default: false,
  },
});
</script>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
