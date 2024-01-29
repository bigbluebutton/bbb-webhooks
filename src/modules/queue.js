import { Queue, Worker } from 'bullmq'

const queues = new Map();

/**
 * createQueue - Create a new BullMQ queue and worker.
 * @param {string} id - Queue ID
 * @param {Function} processor - Job processor function
 * @param {object} options - Queue options
 * @param {string} options.host - Redis host
 * @param {string} options.port - Redis port
 * @param {string} options.password - Redis password
 * @param {number} options.concurrency - Worker concurrency
 * @returns {object} - a { queue, worker } object
 */
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

/**
 * addJob - Fetch the queue for the given ID and add a job to it.
 * @param {string} id - Queue ID
 * @param {object} job - Job to add (BullMQ job)
 * @returns {object} - a { queue, worker } object
 */
const addJob = (id, job) => {
  const queue = queues.get(id);

  if (queue) {
    queue.queue.add(job);
  }

  return queue;
}

/**
 * getQueue - Get the queue for the given ID.
 * @param {string} id - Queue ID
 * @returns {object} - a { queue, worker } object
 */
const getQueue = (id) => {
  return queues.get(id);
}

/**
 * getQueues.
 * @returns {Map} - a Map of { queue, worker } objects
 */
const getQueues = () => {
  return queues;
}

/**
 * deleteQueue - Delete the queue for the given ID.
 * @param {string} id - Queue ID
 * @returns {boolean} - True if the queue was deleted, false otherwise
 */
const deleteQueue = (id) => {
  const queue = queues.get(id);

  if (queue) {
    queue.queue.close();
    queue.worker.close();
    queues.delete(id);
    return true;
  }

  return false;
}

export {
  createQueue,
  addJob,
  getQueue,
  getQueues,
  deleteQueue,
};
