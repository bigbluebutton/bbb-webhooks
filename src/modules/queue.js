import { Queue, Worker } from 'bullmq'

const queues = new Map();

// Create a new connection in every instance
const createQueue = (id, processor, {
  host,
  port,
  password,
  concurrency = 1,
}) => {
  if (queues.has(id)) return queues.get(id);

  const queue = new Queue(id, {
    connection: {
      host,
      port,
      password,
    },
    concurrency,
  });

  const worker = new Worker(id, processor, {
    connection: {
      host,
      port,
      password,
    },
  });

  queues.set(id, {
    queue,
    worker,
  });

  return {
    queue,
    worker,
  };
};

const addJob = (id, job) => {
  const queue = queues.get(id);

  if (queue) {
    queue.queue.add(job);
  }

  return queue;
}

const getQueue = (id) => {
  return queues.get(id);
}

const getQueues = () => {
  return queues;
}

const deleteQueue = (id) => {
  const queue = queues.get(id);

  if (queue) {
    queue.queue.close();
    queue.worker.close();
    queues.delete(id);
  }

  return queue;
}

export {
  createQueue,
  addJob,
  getQueue,
  getQueues,
  deleteQueue,
};
